import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { LocalMediaStore } from "../../../../../packages/database/src/media.js";
import { hash, DomainError } from "../projects/core.js";
import { finish, heartbeat, type Lease } from "../processing/queue.js";
import { saveArtifact } from "../processing/artifacts.js";
import { buildPlan } from "./validation.js";
import {
  research,
  generate,
  planningConfig,
  PlanningError,
} from "./providers.js";
async function tx<T>(pool: Pool, work: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function runPlanning(
  pool: Pool,
  lease: Lease,
  media: LocalMediaStore,
  deps = { research, generate },
  configured = !!planningConfig().key && planningConfig().enabled,
) {
  if (!configured) {
    await finish(pool, lease, "paused", "PROVIDER_NOT_CONFIGURED");
    return;
  }
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void Promise.all([
      heartbeat(pool, lease),
      pool.query(
        "UPDATE newbert.worker_heartbeats SET last_seen=now() WHERE id=$1",
        [lease.lease_owner],
      ),
    ])
      .catch(() => false)
      .finally(() => {
        ticking = false;
      });
  }, 5000);
  try {
    const row = (
      await pool.query(
        "SELECT j.*,v.input_snapshot FROM newbert.generation_jobs j JOIN newbert.project_versions v ON v.id=j.version_id WHERE j.id=$1",
        [lease.id],
      )
    ).rows[0]!;
    const content = row.input_snapshot;
    let result = row.stage_checkpoint?.providerResult;
    let sources = row.stage_checkpoint?.sources;
    if (!result) {
      sources =
        lease.kind === "ideation"
          ? []
          : await deps.research(content.brief.topic);
      if (lease.kind !== "ideation" && !sources.length)
        throw new PlanningError("EVIDENCE_UNAVAILABLE");
      const messages = (
        await pool.query(
          "SELECT role,content FROM newbert.discussion_messages WHERE project_id=$1 AND created_at<=$2 ORDER BY created_at DESC,id DESC LIMIT 8",
          [lease.project_id, row.created_at],
        )
      ).rows.reverse();
      const input = { brief: content.brief, sources, messages };
      const attempt = randomUUID();
      await tx(pool, async (c) => {
        const valid = (
          await c.query(
            "SELECT id FROM newbert.generation_jobs WHERE id=$1 AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() AND state='running' AND cancel_requested_at IS NULL FOR UPDATE",
            [lease.id, lease.lease_owner, lease.lease_token],
          )
        ).rowCount;
        if (!valid) throw new PlanningError("LEASE_LOST");
        await c.query("SELECT pg_advisory_xact_lock(1793318407)");
        const counts = (
          await c.query(
            "SELECT count(*)::int AS total,count(*) FILTER(WHERE workspace_id=$1)::int AS own FROM newbert.planning_calls WHERE created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
            [lease.workspace_id],
          )
        ).rows[0]!;
        if (counts.total >= 4 || counts.own >= 2)
          throw new PlanningError("PLANNING_DAILY_LIMIT");
        await c.query(
          `INSERT INTO newbert.job_attempts(id,workspace_id,job_id,stage,attempt_number,state,request_fingerprint,lease_token,provider) SELECT $1,$2,$3,$4,coalesce(max(attempt_number),0)+1,'submitted',$5,$6,'gemini' FROM newbert.job_attempts WHERE job_id=$3 AND stage=$4`,
          [
            attempt,
            lease.workspace_id,
            lease.id,
            lease.kind === "ideation" ? "ideating" : "scripting",
            hash(input),
            lease.lease_token,
          ],
        );
        await c.query(
          "INSERT INTO newbert.planning_calls(id,workspace_id,attempt_id) VALUES($1,$2,$3)",
          [randomUUID(), lease.workspace_id, attempt],
        );
        await c.query(
          "UPDATE newbert.generation_jobs SET stage=$2 WHERE id=$1",
          [lease.id, lease.kind === "ideation" ? "ideating" : "researching"],
        );
      });
      try {
        result = await deps.generate(input, lease.kind === "ideation");
      } catch (e) {
        await pool.query(
          "UPDATE newbert.job_attempts SET state=$2,safe_error_code=$3,completed_at=now() WHERE id=$1",
          [
            attempt,
            !(e instanceof PlanningError) || e.uncertain ? "unknown" : "failed",
            e instanceof PlanningError ? e.code : "PROVIDER_OUTCOME_UNKNOWN",
          ],
        );
        throw e;
      }
      await tx(pool, async (c) => {
        const valid = (
          await c.query(
            "SELECT id FROM newbert.generation_jobs WHERE id=$1 AND lease_owner=$2 AND lease_token=$3 AND state='running' AND lease_expires_at>now() FOR UPDATE",
            [lease.id, lease.lease_owner, lease.lease_token],
          )
        ).rowCount;
        if (!valid) throw new PlanningError("LEASE_LOST");
        await c.query(
          "UPDATE newbert.job_attempts SET state='succeeded',completed_at=now() WHERE id=$1",
          [attempt],
        );
        await c.query(
          "UPDATE newbert.generation_jobs SET stage_checkpoint=stage_checkpoint||$2::jsonb WHERE id=$1",
          [lease.id, JSON.stringify({ providerResult: result, sources })],
        );
      });
    }
    if (lease.kind === "ideation") {
      if (
        typeof result.reply !== "string" ||
        result.reply.length < 10 ||
        result.reply.length > 4000
      )
        throw new DomainError(
          422,
          "INVALID_MODEL_OUTPUT",
          "Discussion response was invalid.",
        );
      await tx(pool, async (c) => {
        const valid = (
          await c.query(
            "SELECT id FROM newbert.generation_jobs WHERE id=$1 AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE",
            [lease.id, lease.lease_owner, lease.lease_token],
          )
        ).rowCount;
        if (!valid) return;
        if (
          !(
            await c.query(
              "SELECT 1 FROM newbert.discussion_messages WHERE job_id=$1 AND role='assistant'",
              [lease.id],
            )
          ).rowCount
        )
          await c.query(
            "INSERT INTO newbert.discussion_messages(id,workspace_id,project_id,job_id,role,content) VALUES($1,$2,$3,$4,'assistant',$5)",
            [
              randomUUID(),
              lease.workspace_id,
              lease.project_id,
              lease.id,
              result.reply,
            ],
          );
      });
    } else {
      const plan = buildPlan(result, content, sources);
      if (!row.output_artifact_id)
        await saveArtifact(
          pool,
          media,
          lease,
          {
            kind: "storyboard",
            mimeType: "application/json",
            bytes: Buffer.from(JSON.stringify(plan)),
            inputFingerprint: hash(content),
          },
          async (c, artifactId) => {
            for (const s of plan.sources)
              await c.query(
                "INSERT INTO newbert.sources(id,workspace_id,version_id,title,url,retrieved_at,content_hash,excerpt) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                [
                  s.id,
                  lease.workspace_id,
                  lease.version_id,
                  s.title,
                  s.url,
                  s.retrievedAt,
                  hash(s.excerpt),
                  s.excerpt,
                ],
              );
            for (const claim of plan.claims) {
              await c.query(
                "INSERT INTO newbert.claims(id,workspace_id,version_id,scene_id,claim_text,classification,status,blocking) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
                [
                  claim.id,
                  lease.workspace_id,
                  lease.version_id,
                  claim.sceneId,
                  claim.text,
                  claim.classification,
                  claim.status,
                  claim.blocking,
                ],
              );
              for (const sourceId of claim.sourceIds)
                await c.query(
                  "INSERT INTO newbert.claim_sources(workspace_id,version_id,claim_id,source_id,locator) VALUES($1,$2,$3,$4,$5)",
                  [
                    lease.workspace_id,
                    lease.version_id,
                    claim.id,
                    sourceId,
                    claim.quote,
                  ],
                );
            }
            await c.query(
              "UPDATE newbert.generation_jobs SET output_artifact_id=$2,stage='planning_scenes' WHERE id=$1",
              [lease.id, artifactId],
            );
            await c.query('SELECT newbert.auto_apply_plan($1,$2,$3,$4::jsonb)',[lease.id,lease.lease_owner,lease.lease_token,JSON.stringify(plan.content)]);
          },
        );
    }
    await finish(pool, lease, "succeeded");
  } catch (e) {
    const code =
      e instanceof PlanningError
        ? e.code
        : e instanceof DomainError
          ? e.code
          : e instanceof Error && e.message === "STORAGE_CAPACITY"
            ? "STORAGE_CAPACITY"
            : "PLANNING_FAILED";
    await finish(
      pool,
      lease,
      e instanceof DomainError ? "failed" : "paused",
      code,
    );
  } finally {
    clearInterval(timer);
  }
}
