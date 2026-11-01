import type { PoolClient } from "pg";
import type { FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { current } from "../identity/routes.js";
import {
  active,
  command,
  DomainError,
  draft,
  findDraft,
  findProject,
  hash,
  id,
  job,
  match,
  page,
  pagination,
  tag,
  type Result,
} from "../projects/core.js";
import { emit, reserve } from "../processing/queue.js";
import { LocalMediaStore, type MediaStore } from "../../../../../packages/database/src/media.js";
import { checkScenes } from "./validation.js";
type Auth = NonNullable<Awaited<ReturnType<typeof current>>>;
export type Register = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  work: (c: PoolClient, r: FastifyRequest, a: Auth) => Promise<Result>,
  schema?: string,
) => void;
export function registerPlanningRoutes(
  route: Register,
  media: MediaStore = new LocalMediaStore(),
) {
  const param = (r: FastifyRequest) => r.params as Record<string, string>;
  route("GET", "/projects/:projectId/messages", async (c, r) => {
    const p = await findProject(c, param(r).projectId!);
    const { limit, cursor } = pagination(r.query as Record<string, unknown>);
    const rows = (
      await c.query(
        `SELECT *,created_at::text AS cursor_time FROM newbert.discussion_messages WHERE project_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
        [p.id, cursor?.time ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    return {
      body: page(rows, limit, (m) => ({
        id: m.id,
        projectId: m.project_id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
    };
  });
  route(
    "POST",
    "/projects/:projectId/messages",
    async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        "discussion:" + param(r).projectId,
        r.headers["idempotency-key"],
        { body: r.body, etag: r.headers["if-match"] ?? null },
        async () => {
          const p = await findProject(c, param(r).projectId!, true);
          active(p);
          const d = await findDraft(c, p.id);
          match(r.headers["if-match"], tag("draft", d));
          const text = (r.body as { content: string }).content.trim();
          if (!text)
            throw new DomainError(
              422,
              "EMPTY_MESSAGE",
              "Write a question or an idea.",
            );
          if (
            (
              await c.query(
                "SELECT 1 FROM newbert.generation_jobs WHERE project_id=$1 AND state IN ('queued','running','paused')",
                [p.id],
              )
            ).rowCount
          )
            throw new DomainError(
              409,
              "ACTIVE_JOB",
              "Wait for or cancel the active request first.",
            );
          const versionId = randomUUID();
          await c.query(
            `INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8)`,
            [
              versionId,
              a.domain.workspace_id,
              p.id,
              p.next_version_number,
              d.revision,
              JSON.stringify(d.content),
              hash(d.content),
              d.content.brief.mode,
            ],
          );
          await c.query(
            "UPDATE newbert.projects SET next_version_number=next_version_number+1,revision=revision+1,updated_at=now() WHERE id=$1",
            [p.id],
          );
          const row = (
            await c.query(
              "INSERT INTO newbert.generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key) VALUES($1,$2,$3,$4,'ideation',$5) RETURNING *",
              [
                randomUUID(),
                a.domain.workspace_id,
                p.id,
                versionId,
                randomUUID(),
              ],
            )
          ).rows[0]!;
          const message = (
            await c.query(
              "INSERT INTO newbert.discussion_messages(id,workspace_id,project_id,job_id,role,content) VALUES($1,$2,$3,$4,'user',$5) RETURNING *",
              [randomUUID(), a.domain.workspace_id, p.id, row.id, text],
            )
          ).rows[0]!;
          await reserve(c, a.domain.workspace_id, row.id);
          await emit(c, row, "job.queued");
          return {
            body: {
              message: {
                id: message.id,
                projectId: p.id,
                role: "user",
                content: text,
                createdAt: message.created_at,
              },
              job: job(row),
            },
            status: 202,
            etag: tag("job", row),
          };
        },
      ),
    "MessageCreate",
  );
  route("GET", "/versions/:versionId/evidence", async (c, r) => {
    const versionId = id(param(r).versionId!);
    if (
      !(
        await c.query("SELECT 1 FROM newbert.project_versions WHERE id=$1", [
          versionId,
        ])
      ).rowCount
    )
      throw new DomainError(404, "NOT_FOUND", "Version not found.");
    const binding = (
      await c.query(
        "SELECT planning_version_id FROM newbert.storyboard_approvals WHERE version_id=$1",
        [versionId],
      )
    ).rows[0];
    const evidenceVersion = binding?.planning_version_id ?? versionId;
    const sources = (
      await c.query(
        "SELECT id,title,url,retrieved_at,excerpt FROM newbert.sources WHERE version_id=$1 ORDER BY id",
        [evidenceVersion],
      )
    ).rows;
    const claims = (
      await c.query(
        "SELECT c.*,ARRAY(SELECT source_id FROM newbert.claim_sources WHERE claim_id=c.id) AS source_ids FROM newbert.claims c WHERE version_id=$1 ORDER BY id",
        [evidenceVersion],
      )
    ).rows;
    return {
      body: {
        versionId,
        sources: sources.map((s) => ({
          id: s.id,
          title: s.title,
          url: s.url,
          retrievedAt: s.retrieved_at,
          excerpt: s.excerpt,
        })),
        claims: claims.map((c) => ({
          id: c.id,
          sceneId: c.scene_id,
          text: c.claim_text,
          classification: c.classification,
          status: c.status,
          blocking: c.blocking,
          sourceIds: c.source_ids,
        })),
      },
    };
  });
  route(
    "POST",
    "/projects/:projectId/draft/apply-result",
    async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        "apply-plan:" + param(r).projectId,
        r.headers["idempotency-key"],
        { body: r.body, etag: r.headers["if-match"] ?? null },
        async () => {
          const p = await findProject(c, param(r).projectId!, true);
          active(p);
          const d = await findDraft(c, p.id);
          match(r.headers["if-match"], tag("draft", d));
          const artifact = (
            await c.query(
              "SELECT a.*,v.input_snapshot,j.state FROM newbert.artifacts a JOIN newbert.project_versions v ON v.id=a.version_id JOIN newbert.generation_jobs j ON j.id=a.job_id WHERE a.id=$1 AND a.project_id=$2 AND a.kind='storyboard' AND a.validation_status='passed' AND a.storage_status='available' AND j.state='succeeded'",
              [id((r.body as { artifactId: string }).artifactId), p.id],
            )
          ).rows[0];
          if (!artifact)
            throw new DomainError(
              404,
              "NOT_FOUND",
              "A completed storyboard for this project was not found.",
            );
          if (hash(d.content.brief) !== hash(artifact.input_snapshot.brief))
            throw new DomainError(
              409,
              "PLAN_STALE",
              "The brief changed after this plan was submitted. Generate a fresh plan.",
            );
          const bytes = await media.get(artifact.storage_key);
          if (
            hash(JSON.parse(bytes.toString()).content) !==
            hash({
              ...artifact.input_snapshot,
              scenes: JSON.parse(bytes.toString()).content.scenes,
            })
          )
            throw new DomainError(
              422,
              "INVALID_ARTIFACT",
              "Storyboard content does not match its submitted input.",
            );
          if (
            createHash("sha256").update(bytes).digest("hex") !==
            artifact.content_hash
          )
            throw new DomainError(
              422,
              "INVALID_ARTIFACT",
              "Artifact integrity check failed.",
            );
          const plan = JSON.parse(bytes.toString());
          checkScenes(plan.content);
          const content = {
            ...plan.content,
            voice: d.content.voice,
            style: d.content.style,
          };
          const updated = (
            await c.query(
              "UPDATE newbert.project_drafts SET content=$2,planning_version_id=$3,planning_artifact_id=$4,revision=revision+1,updated_at=now() WHERE project_id=$1 RETURNING *",
              [p.id, JSON.stringify(content), artifact.version_id, artifact.id],
            )
          ).rows[0]!;
          await c.query(
            "UPDATE newbert.projects SET revision=revision+1,updated_at=now() WHERE id=$1",
            [p.id],
          );
          return { body: draft(updated), etag: tag("draft", updated) };
        },
      ),
    "ApplyResult",
  );
  route("GET", "/projects/:projectId/storyboard", async (c, r) => {
    const p = await findProject(c, param(r).projectId!);
    const d = await findDraft(c, p.id);
    const approval =
      (
        await c.query(
          "SELECT id,draft_revision,content_hash,created_at,reviewed_claim_ids FROM newbert.storyboard_approvals WHERE project_id=$1 AND draft_revision=$2",
          [p.id, d.revision],
        )
      ).rows[0] ?? null;
    return {
      body: {
        ...draft(d),
        planningVersionId: d.planning_version_id,
        approval:
          approval && approval.content_hash === hash(d.content)
            ? approval
            : null,
      },
      etag: tag("draft", d),
    };
  });
  route("POST", "/projects/:projectId/storyboard/approve", async (c, r, a) =>
    command(
      c,
      a.domain.workspace_id,
      "approve:" + param(r).projectId,
      r.headers["idempotency-key"],
      { body: r.body, etag: r.headers["if-match"] ?? null },
      async () => {
        const p = await findProject(c, param(r).projectId!, true);
        active(p);
        const d = await findDraft(c, p.id);
        match(r.headers["if-match"], tag("draft", d));
        return approveCurrent(
          c,
          p,
          d,
          a,
          r.body as {
            reviewedClaimIds?: unknown;
            acknowledgedVoiceTerms?: unknown;
          },
          media,
        );
      },
    ),
  );
  route("GET", "/voices", async (_c, r) => {
    const q = r.query as Record<string, unknown>;
    if (q.providerConnectionId !== undefined)
      throw new DomainError(
        409,
        "PERSONAL_VOICES_NOT_READY",
        "Personal provider connections are not available yet; no fallback connection was used.",
      );
    if (
      q.language !== undefined &&
      !["Hindi", "Hinglish"].includes(String(q.language))
    )
      throw new DomainError(
        422,
        "UNSUPPORTED_LANGUAGE",
        "Choose Hindi or Hinglish.",
      );
    return { body: await voiceCatalog() };
  });
}
// Catalog reads do not synthesize speech. Only the operator's existing voice is
// selectable here; entitlement/commercial rights remain explicit and unverified.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export async function voiceCatalog() {
  let env: Record<string, string | undefined> = {};
  try {
    env = parseEnv(readFileSync(".env", "utf8"));
  } catch {}
  const voiceId = process.env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID;
  return {
    items: voiceId
      ? [
          {
            catalogVoiceId: voiceId,
            name: "Configured Hindi / Hinglish voice",
            provider: "elevenlabs",
            languages: ["Hindi", "Hinglish"],
            available: true,
            commercialUse: "unknown",
            attributionRequired: true,
            termsUrl: "https://elevenlabs.io/terms-of-use",
          },
        ]
      : [],
    nextCursor: null,
  };
}

export async function approveCurrent(
  c: PoolClient,
  p: any,
  d: any,
  a: Auth,
  body: { reviewedClaimIds?: unknown; acknowledgedVoiceTerms?: unknown },
  media: MediaStore = new LocalMediaStore(),
): Promise<Result> {
  checkScenes(d.content);

  if (
    !body ||
    Object.keys(body).some(
      (k) => !["reviewedClaimIds", "acknowledgedVoiceTerms"].includes(k),
    ) ||
    !Array.isArray(body.reviewedClaimIds) ||
    body.reviewedClaimIds.length > 200 ||
    body.reviewedClaimIds.some((v) => typeof v !== "string")
  )
    throw new DomainError(422, "INVALID_REVIEW", "Provide reviewed claim IDs.");
  if (!d.planning_version_id)
    throw new DomainError(
      409,
      "EVIDENCE_REQUIRED",
      "Apply a generated storyboard before approving.",
    );
  const claims = (
    await c.query(
      "SELECT c.*,ARRAY(SELECT source_id FROM newbert.claim_sources WHERE claim_id=c.id) AS sources FROM newbert.claims c WHERE version_id=$1",
      [d.planning_version_id],
    )
  ).rows.filter((c) =>
    d.content.scenes.some((s: any) => s.claimIds.includes(c.id)),
  );
  const known = new Set(claims.map((c) => c.id));
  const reviewed = new Set(body.reviewedClaimIds);
  if ([...reviewed].some((v) => !known.has(v)))
    throw new DomainError(
      422,
      "INVALID_REVIEW",
      "A reviewed claim does not belong to this storyboard.",
    );
  const original = (
    await c.query(
      "SELECT a.storage_key,a.content_hash FROM newbert.artifacts a WHERE id=$1 AND kind='storyboard' AND storage_status='available' AND validation_status='passed'",
      [d.planning_artifact_id],
    )
  ).rows[0];
  if (!original)
    throw new DomainError(
      409,
      "EVIDENCE_REQUIRED",
      "The original storyboard is unavailable.",
    );
  const originalBytes = await media.get(original.storage_key);
  if (
    createHash("sha256").update(originalBytes).digest("hex") !==
    original.content_hash
  )
    throw new DomainError(
      422,
      "INVALID_ARTIFACT",
      "Original storyboard integrity check failed.",
    );
  const plan = JSON.parse(originalBytes.toString());
  for (const scene of d.content.scenes) {
    const before = plan.content.scenes.find((s: any) => s.id === scene.id);
    if (
      !before ||
      before.spokenNarration !== scene.spokenNarration ||
      before.displayNarration !== scene.displayNarration ||
      hash(before.claimIds) !== hash(scene.claimIds)
    )
      throw new DomainError(
        409,
        "SCRIPT_CHANGED",
        "Narration changed. Generate and review fresh evidence before approval.",
      );
    for (const cid of scene.claimIds)
      if (!known.has(cid))
        throw new DomainError(
          422,
          "INVALID_CLAIM",
          "Scene claim references are invalid.",
        );
  }
  if (d.content.scenes.length !== plan.content.scenes.length)
    throw new DomainError(
      409,
      "SCRIPT_CHANGED",
      "Scene coverage changed. Generate a fresh plan.",
    );
  if (
    claims.some(
      (c) =>
        c.blocking &&
        (c.status === "unsupported" ||
          !c.sources.length ||
          (d.content.brief.mode === "automatic" && c.status !== "supported") ||
          (c.status !== "supported" && !reviewed.has(c.id))),
    )
  )
    throw new DomainError(
      409,
      "EVIDENCE_REVIEW_REQUIRED",
      "Unsupported claims block approval. Review factual source support; automatic mode cannot bypass review flags.",
    );
  if (
    !d.content.voice ||
    d.content.voice.providerConnectionId !== null ||
    body.acknowledgedVoiceTerms !== true
  )
    throw new DomainError(
      409,
      "VOICE_REQUIRED",
      "Select a voice and acknowledge provider terms. Narration generation remains a later step.",
    );
  const configured = await voiceCatalog();
  if (
    !configured.items.some(
      (v) => v.catalogVoiceId === d.content.voice.catalogVoiceId,
    )
  )
    throw new DomainError(
      409,
      "VOICE_UNAVAILABLE",
      "Select a voice from the available catalog.",
    );
  const approvalId = randomUUID();
  const previous = (
    await c.query(
      "SELECT id,version_id,draft_revision,content_hash FROM newbert.storyboard_approvals WHERE project_id=$1 AND draft_revision=$2",
      [p.id, d.revision],
    )
  ).rows[0];
  if (previous)
    return { body: { approval: previous, productionAvailable: true } };
  const approvedVersion = randomUUID();
  await c.query(
    `INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode,approval_actor_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,now())`,
    [
      approvedVersion,
      a.domain.workspace_id,
      p.id,
      p.next_version_number,
      d.revision,
      JSON.stringify(d.content),
      hash(d.content),
      d.content.brief.mode,
      a.domain.user_id,
    ],
  );
  await c.query(
    "UPDATE newbert.projects SET next_version_number=next_version_number+1,revision=revision+1,updated_at=now() WHERE id=$1",
    [p.id],
  );
  await c.query(
    "INSERT INTO newbert.storyboard_approvals(id,workspace_id,project_id,draft_revision,content_hash,actor_id,reviewed_claim_ids,version_id,planning_version_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      approvalId,
      a.domain.workspace_id,
      p.id,
      d.revision,
      hash(d.content),
      a.domain.user_id,
      [...reviewed],
      approvedVersion,
      d.planning_version_id,
    ],
  );
  const saved = (
    await c.query(
      "SELECT id,version_id,draft_revision,content_hash FROM newbert.storyboard_approvals WHERE project_id=$1 AND draft_revision=$2",
      [p.id, d.revision],
    )
  ).rows[0];
  return {
    body: { approval: saved, productionAvailable: true },
    status: 200,
  };
}
