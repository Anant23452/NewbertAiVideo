import { REQUEST_LIMITS } from "../processing/request-limits.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { MediaStore } from "../../../../../packages/database/src/media.js";
import { hash } from "../projects/core.js";
import { heartbeat, finish, type Lease } from "../processing/queue.js";
import { saveArtifact } from "../processing/artifacts.js";
import { speechConfig, eligibility, synthesize } from "./provider.js";
import { align, speechManifest, ProductionError } from "./timing.js";
import { measureAudio, renderVideo, renderPreflight } from "./render.js";
import { sceneOps } from "../../../../../packages/contracts/src/composition.js";
export async function savedNarration(
  c: { query: PoolClient["query"] },
  workspaceId: string,
  fingerprint: string,
) {
  return (
    await c.query(
      "SELECT a.*,audio.storage_key AS audio_key,audio.id AS audio_id,audio.content_hash AS audio_hash FROM newbert.artifacts a JOIN newbert.artifacts audio ON audio.id::text=a.metadata->>'audioArtifactId' AND audio.workspace_id=a.workspace_id AND audio.input_fingerprint=a.input_fingerprint WHERE a.workspace_id=$1 AND a.kind='alignment' AND a.input_fingerprint=$2 AND a.validation_status='passed' AND a.storage_status='available' AND audio.kind='audio' AND audio.storage_status='available' AND audio.validation_status='passed' ORDER BY a.created_at DESC LIMIT 1",
      [workspaceId, fingerprint],
    )
  ).rows[0];
}
async function guarded<T>(
  pool: Pool,
  lease: Lease,
  work: (c: PoolClient, row: any) => Promise<T>,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const row = (
      await c.query(
        "SELECT * FROM newbert.generation_jobs WHERE id=$1 AND state='running' AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() FOR UPDATE",
        [lease.id, lease.lease_owner, lease.lease_token],
      )
    ).rows[0];
    if (!row) throw new ProductionError("LEASE_LOST");
    const value = await work(c, row);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const defaults = { eligibility, synthesize, measureAudio, renderVideo };
export async function runProduction(
  pool: Pool,
  lease: Lease,
  media: MediaStore,
  deps = defaults,
) {
  const root = resolve(".local/production-work");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dir = join(root, lease.id + "-" + lease.lease_token);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
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
      .then(([ok]) => {
        if (!ok) controller.abort();
      })
      .catch(() => controller.abort())
      .finally(() => {
        ticking = false;
      });
  }, 4000);
  const stage = async (name: string) =>
    guarded(pool, lease, async (c) => {
      await c.query("UPDATE newbert.generation_jobs SET stage=$2 WHERE id=$1", [
        lease.id,
        name,
      ]);
    });
  const checkpoint = async (value: Record<string, unknown>) =>
    guarded(pool, lease, async (c) => {
      await c.query(
        "UPDATE newbert.generation_jobs SET stage_checkpoint=stage_checkpoint||$2::jsonb WHERE id=$1",
        [lease.id, JSON.stringify(value)],
      );
    });
  const settle = async (resource: string, actual: number) =>
    guarded(pool, lease, async (c) => {
      await c.query("SELECT newbert.settle_media_resource($1,$2,$3)", [
        lease.id,
        resource,
        actual,
      ]);
    });
  try {
    await renderPreflight();
    let row = (
      await pool.query(
        "SELECT j.*,v.input_snapshot,v.input_hash FROM newbert.generation_jobs j JOIN newbert.project_versions v ON v.id=j.version_id WHERE j.id=$1",
        [lease.id],
      )
    ).rows[0]!;
    const content = row.input_snapshot;
    const config = speechConfig();
    const manifest = speechManifest(content, config);
    if (
      !row.provider_binding?.termsAcknowledged ||
      row.provider_binding.speechFingerprint !== manifest.fingerprint
    )
      throw new ProductionError("PROVIDER_OR_SCRIPT_CHANGED");
    const limits = (
      await pool.query(
        "SELECT * FROM newbert.production_limits WHERE singleton",
      )
    ).rows[0]!;
    content.scenes.forEach((s: any, i: number) =>
      sceneOps(
        { ...s, start: 0, end: 120, captions: [], timedCues: [] },
        i,
        content.style.accentColor,
      ),
    );
    let bundle = await savedNarration(
      pool,
      lease.workspace_id,
      manifest.fingerprint,
    );
    let audioId: string, alignmentId: string, timing: any;
    if (bundle) {
      await writeFile(
        join(dir, "audio.mp3"),
        await media.get(bundle.audio_key),
      );
      const stored = JSON.parse(
        (await media.get(bundle.storage_key)).toString(),
      );
      const audioBytes = await readFile(join(dir, "audio.mp3"));
      const alignmentBytes = await media.get(bundle.storage_key);
      if (
        createHash("sha256").update(audioBytes).digest("hex") !==
          bundle.audio_hash ||
        createHash("sha256").update(alignmentBytes).digest("hex") !==
          bundle.content_hash
      )
        throw new ProductionError("NARRATION_INTEGRITY_FAILED");
      const duration = await deps.measureAudio(dir);
      timing = align(manifest, stored.alignment, duration);
      audioId = bundle.audio_id;
      alignmentId = bundle.id;
      await checkpoint({
        audioId,
        alignmentId,
        reusedNarration: true,
        durationMs: Math.round(duration * 1000),
      });
      await settle("provider_credits", 0);
      await settle("narration_ms", 0);
    } else {
      let response = row.stage_checkpoint.speechResponse;
      let identity = row.stage_checkpoint.speechIdentity;
      if (!response) {
        if (row.provider_binding.allowNewSpeech !== true)
          throw new ProductionError("NARRATION_NOT_REUSABLE");
        await stage("generating_voice");
        identity = await deps.eligibility(config.voiceId, manifest.characters);
        if (controller.signal.aborted)
          throw new ProductionError("WORK_CANCELLED");
        const attempt = randomUUID();
        await guarded(pool, lease, async (c, j) => {
          if (j.cancel_requested_at)
            throw new ProductionError("WORK_CANCELLED");
          await c.query("SELECT pg_advisory_xact_lock(1793318409)");
          // Another queued job may have submitted identical speech since this
          // job was admitted. Recheck under the submission lock before charging.
          if (
            (
              await c.query(
                "SELECT 1 FROM newbert.job_attempts WHERE workspace_id=$1 AND stage='generating_voice' AND request_fingerprint=$2 AND state IN ('prepared','submitted','unknown') LIMIT 1",
                [lease.workspace_id, manifest.fingerprint],
              )
            ).rowCount
          )
            throw new ProductionError("NARRATION_REQUEST_UNRESOLVED");
          const calls = (
            await c.query(
              "SELECT count(*)::int AS total,count(*) FILTER(WHERE workspace_id=$1)::int AS own FROM newbert.speech_calls WHERE created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
              [lease.workspace_id],
            )
          ).rows[0]!;
          if (
            calls.total >= REQUEST_LIMITS.global ||
            calls.own >= REQUEST_LIMITS.workspace
          )
            throw new ProductionError("SPEECH_DAILY_REQUEST_LIMIT");
          await c.query(
            `INSERT INTO newbert.job_attempts(id,workspace_id,job_id,stage,attempt_number,state,request_fingerprint,lease_token,provider) SELECT $1,$2,$3,'generating_voice',coalesce(max(attempt_number),0)+1,'submitted',$4,$5,'elevenlabs' FROM newbert.job_attempts WHERE job_id=$3 AND stage='generating_voice'`,
            [
              attempt,
              lease.workspace_id,
              lease.id,
              manifest.fingerprint,
              lease.lease_token,
            ],
          );
          await c.query(
            "INSERT INTO newbert.speech_calls(id,workspace_id,job_id,attempt_id,characters) VALUES($1,$2,$3,$4,$5)",
            [
              randomUUID(),
              lease.workspace_id,
              lease.id,
              attempt,
              manifest.characters,
            ],
          );
        });
        try {
          response = await deps.synthesize(
            manifest.text,
            config.voiceId,
            undefined,
            controller.signal,
          );
        } catch (e) {
          const uncertain = !(e instanceof ProductionError) || e.uncertain;
          await pool.query(
            "UPDATE newbert.job_attempts SET state=$2,safe_error_code=$3,completed_at=now() WHERE id=$1",
            [
              attempt,
              uncertain ? "unknown" : "failed",
              e instanceof ProductionError ? e.code : "SPEECH_OUTCOME_UNKNOWN",
            ],
          );
          throw e;
        }
        await guarded(pool, lease, async (c) => {
          await c.query(
            "UPDATE newbert.job_attempts SET state='succeeded',provider_request_id=$2,completed_at=now() WHERE id=$1",
            [attempt, response.requestId || null],
          );
          await c.query(
            "UPDATE newbert.generation_jobs SET stage_checkpoint=stage_checkpoint||$2::jsonb WHERE id=$1",
            [
              lease.id,
              JSON.stringify({
                speechResponse: response,
                speechIdentity: identity,
              }),
            ],
          );
          await c.query("SELECT newbert.settle_media_resource($1,$2,$3)", [
            lease.id,
            "provider_credits",
            manifest.characters,
          ]);
        });
      }
      const audio = Buffer.from(response.audio_base64, "base64");
      if (!audio.length || audio.length > 4 * 1024 * 1024)
        throw new ProductionError("AUDIO_SIZE_LIMIT");
      await writeFile(join(dir, "audio.mp3"), audio);
      await stage("aligning");
      const duration = await deps.measureAudio(dir);
      await settle("narration_ms", Math.ceil(duration * 1000));
      // Persist valid decoded audio even if subsequent alignment/duration checks fail.
      audioId =
        row.stage_checkpoint.audioId ||
        (await saveArtifact(
          pool,
          media,
          lease,
          {
            kind: "audio",
            mimeType: "audio/mpeg",
            bytes: audio,
            inputFingerprint: manifest.fingerprint,
            durationMs: Math.ceil(duration * 1000),
            metadata: {
              ...identity,
              requestId: response.requestId || null,
              speechFingerprint: manifest.fingerprint,
            },
          },
          async (c, id) => {
            await c.query(
              "UPDATE newbert.generation_jobs SET stage_checkpoint=stage_checkpoint||$2::jsonb WHERE id=$1",
              [
                lease.id,
                JSON.stringify({
                  audioId: id,
                  durationMs: Math.ceil(duration * 1000),
                }),
              ],
            );
          },
        )) ||
        "";
      if (!audioId) throw new ProductionError("LEASE_LOST");
      timing = align(manifest, response.alignment, duration);
      alignmentId =
        (await saveArtifact(
          pool,
          media,
          lease,
          {
            kind: "alignment",
            mimeType: "application/json",
            bytes: Buffer.from(
              JSON.stringify({
                alignment: response.alignment,
                speechFingerprint: manifest.fingerprint,
              }),
            ),
            inputFingerprint: manifest.fingerprint,
            durationMs: Math.ceil(duration * 1000),
            metadata: { audioArtifactId: audioId },
          },
          async (c, id) => {
            await c.query(
              "UPDATE newbert.generation_jobs SET stage_checkpoint=(stage_checkpoint-'speechResponse')||$2::jsonb WHERE id=$1",
              [
                lease.id,
                JSON.stringify({
                  alignmentId: id,
                  audioId,
                  durationMs: Math.ceil(duration * 1000),
                }),
              ],
            );
          },
        )) || "";
      if (!alignmentId) throw new ProductionError("LEASE_LOST");
    }
    if (timing.duration * 1000 > Number(limits.max_duration_ms))
      throw new ProductionError("NARRATION_DURATION_LIMIT");
    timing.timeline.forEach((s: any, i: number) =>
      sceneOps(s, i, content.style.accentColor),
    );
    row = (
      await pool.query("SELECT * FROM newbert.generation_jobs WHERE id=$1", [
        lease.id,
      ])
    ).rows[0]!;
    if (row.stage_checkpoint.videoId) {
      await finish(pool, lease, "succeeded");
      return;
    }
    if (row.stage_checkpoint.renderStarted)
      throw new ProductionError("RENDER_INTERRUPTED_RETRY_REQUIRED");
    await stage("composing");
    const compositionId = await saveArtifact(pool, media, lease, {
      kind: "composition",
      mimeType: "application/json",
      bytes: Buffer.from(JSON.stringify({ schemaVersion: 1, content, timing })),
      inputFingerprint: hash({
        input: row.input_hash,
        speech: manifest.fingerprint,
        renderer: "newbert-ass-v2",
      }),
    });
    if (!compositionId) throw new ProductionError("LEASE_LOST");
    await checkpoint({ renderStarted: true, compositionId });
    await settle("render_ms", Math.ceil(timing.duration * 1000));
    await stage("rendering");
    const result = await deps.renderVideo(
      dir,
      timing,
      content,
      controller.signal,
    );
    await stage("checking");
    const reportId = await saveArtifact(pool, media, lease, {
      kind: "validation",
      mimeType: "application/json",
      bytes: Buffer.from(JSON.stringify(result.validation)),
      inputFingerprint: hash(result.validation),
    });
    if (!reportId) throw new ProductionError("LEASE_LOST");
    const captions = timing.timeline.flatMap((s: any) => s.captions);
    const timestamp = (s: number) => {
      const ms = Math.round(s * 1000);
      return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
    };
    const vtt =
      "WEBVTT\n\n" +
      captions
        .map(
          (c: any, i: number) =>
            `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text.replaceAll("-->", "→").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}\n`,
        )
        .join("\n");
    const captionsId = await saveArtifact(pool, media, lease, {
      kind: "captions",
      mimeType: "text/vtt",
      bytes: Buffer.from(vtt),
      inputFingerprint: hash(captions),
    });
    if (!captionsId) throw new ProductionError("LEASE_LOST");
    const videoId = await saveArtifact(
      pool,
      media,
      lease,
      {
        kind: "video",
        mimeType: "video/mp4",
        bytes: result.bytes,
        inputFingerprint: hash({
          input: row.input_hash,
          speech: manifest.fingerprint,
          renderer: "newbert-ass-v2",
        }),
        durationMs: Math.round(result.validation.videoDurationMs),
        metadata: {
          validation: result.validation,
          commercialUse: "not_permitted",
          attributionRequired: true,
          voiceProvider: "elevenlabs",
        },
      },
      async (c, id) => {
        for (const dep of [
          audioId,
          alignmentId,
          compositionId,
          reportId,
          captionsId,
        ])
          await c.query(
            "INSERT INTO newbert.artifact_dependencies(workspace_id,artifact_id,depends_on_id) VALUES($1,$2,$3)",
            [lease.workspace_id, id, dep],
          );
        await c.query(
          "UPDATE newbert.generation_jobs SET output_artifact_id=$2,stage_checkpoint=stage_checkpoint||$3::jsonb WHERE id=$1",
          [
            lease.id,
            id,
            JSON.stringify({
              videoId: id,
              compositionId,
              audioId,
              alignmentId,
              reportId,
              captionsId,
            }),
          ],
        );
        await c.query(
          "UPDATE newbert.projects SET latest_output_artifact_id=$2,revision=revision+1,updated_at=now() WHERE id=$1",
          [lease.project_id, id],
        );
      },
    );
    if (!videoId) throw new ProductionError("LEASE_LOST");
    await finish(pool, lease, "succeeded");
  } catch (e) {
    const code =
      e instanceof ProductionError
        ? e.code
        : e instanceof Error &&
            /^(TEXT_|VISUAL_|INVALID_|STORAGE_)/.test(e.message)
          ? e.message
          : "PRODUCTION_FAILED";
    const terminal = [
      "ENCODER_FAILED",
      "VIDEO_VALIDATION_FAILED",
      "VIDEO_SIZE_LIMIT",
      "RENDER_INTERRUPTED_RETRY_REQUIRED",
    ].includes(code);
    await finish(pool, lease, terminal ? "failed" : "paused", code);
  } finally {
    clearInterval(timer);
    const target = resolve(dir);
    if (relative(root, target) && !relative(root, target).startsWith(".."))
      await rm(target, { recursive: true, force: true }).catch(() => {});
  }
}
