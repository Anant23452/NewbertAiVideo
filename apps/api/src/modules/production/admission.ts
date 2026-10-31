import { savedNarration } from "./runner.js";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { hash, DomainError, job, tag } from "../projects/core.js";
import { approveCurrent } from "../planning/routes.js";
import { reserve, emit } from "../processing/queue.js";
import { speechConfig } from "./provider.js";
import { speechManifest } from "./timing.js";
import { sceneOps } from "../../../../../packages/contracts/src/composition.js";
import type { LocalMediaStore } from "../../../../../packages/database/src/media.js";
export async function admitProduction(
  c: PoolClient,
  p: any,
  d: any,
  a: any,
  body: any,
  media?: LocalMediaStore,
) {
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
  if (
    !(
      await c.query(
        "SELECT production_enabled FROM newbert.processing_policy WHERE singleton",
      )
    ).rows[0].production_enabled
  )
    throw new DomainError(
      503,
      "PRODUCTION_PAUSED",
      "Video production is temporarily paused.",
    );
  let approval = (
    await c.query(
      "SELECT * FROM newbert.storyboard_approvals WHERE project_id=$1 AND draft_revision=$2 AND content_hash=$3",
      [p.id, d.revision, hash(d.content)],
    )
  ).rows[0];
  if (!approval && d.content.brief.mode === "automatic") {
    await approveCurrent(
      c,
      p,
      d,
      a,
      {
        reviewedClaimIds: [],
        acknowledgedVoiceTerms: body.acknowledgedVoiceTerms,
      },
      media,
    );
    approval = (
      await c.query(
        "SELECT * FROM newbert.storyboard_approvals WHERE project_id=$1 AND draft_revision=$2",
        [p.id, d.revision],
      )
    ).rows[0];
  }
  if (
    !approval?.version_id ||
    (d.content.brief.mode === "guided" && body.scriptApproved !== true)
  )
    throw new DomainError(
      409,
      "APPROVAL_REQUIRED",
      "Approve this exact saved storyboard before producing it.",
    );
  if (body.acknowledgedVoiceTerms !== true)
    throw new DomainError(
      422,
      "VOICE_TERMS_REQUIRED",
      "Acknowledge non-commercial use, voice attribution and provider allowance.",
    );
  const config = speechConfig();
  if (d.content.voice?.catalogVoiceId !== config.voiceId)
    throw new DomainError(
      409,
      "VOICE_CHANGED",
      "The selected voice is no longer configured. Select and approve it again.",
    );
  let manifest;
  try {
    manifest = speechManifest(d.content, config);
    d.content.scenes.forEach((s: any, i: number) =>
      sceneOps(
        { ...s, start: 0, end: 120, captions: [], timedCues: [] },
        i,
        d.content.style.accentColor,
      ),
    );
  } catch (e) {
    throw new DomainError(
      422,
      e instanceof Error ? e.message : "INVALID_COMPOSITION",
      "Shorten labels, narration or unsupported overrides before producing.",
    );
  }
  const limits = (
    await c.query("SELECT * FROM newbert.production_limits WHERE singleton")
  ).rows[0]!;
  if (manifest.characters > limits.max_characters)
    throw new DomainError(
      422,
      "SCRIPT_CHARACTER_LIMIT",
      `This pilot allows at most ${limits.max_characters} spoken characters. Shorten the narration first.`,
    );
  if (
    (
      await c.query(
        "SELECT 1 FROM newbert.job_attempts WHERE stage='generating_voice' AND request_fingerprint=$1 AND state IN ('prepared','submitted','unknown') LIMIT 1",
        [manifest.fingerprint],
      )
    ).rowCount
  )
    throw new DomainError(
      409,
      "RECONCILIATION_REQUIRED",
      "An identical narration request is in flight or has an unknown provider outcome. Wait for it to finish or be reconciled.",
    );
  const reused = await savedNarration(
    c,
    a.domain.workspace_id,
    manifest.fingerprint,
  );
  if (reused && Number(reused.duration_ms) > Number(limits.max_duration_ms))
    throw new DomainError(
      422,
      "NARRATION_TOO_LONG",
      "The saved narration is too long. Shorten and re-approve the script.",
    );
  const row = (
    await c.query(
      "INSERT INTO newbert.generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key,provider_binding) VALUES($1,$2,$3,$4,'produce',$5,$6) RETURNING *",
      [
        randomUUID(),
        a.domain.workspace_id,
        p.id,
        approval.version_id,
        randomUUID(),
        JSON.stringify({
          voiceId: config.voiceId,
          model: config.model,
          credentialVersion: config.credentialVersion,
          speechFingerprint: manifest.fingerprint,
          freeOnly: true,
          termsAcknowledged: true,
          allowNewSpeech: !reused,
        }),
      ],
    )
  ).rows[0]!;
  await reserve(c, a.domain.workspace_id, row.id);
  try {
    for (const [resource, units] of [
      ["provider_credits", reused ? 0 : manifest.characters],
      ["narration_ms", reused ? 0 : Number(limits.max_duration_ms)],
      ["render_ms", Number(limits.max_duration_ms)],
    ] as const)
      await c.query("SELECT newbert.reserve_media_resource($1,$2,$3)", [
        row.id,
        resource,
        units,
      ]);
  } catch {
    throw new DomainError(
      429,
      "MEDIA_ALLOWANCE_EXHAUSTED",
      "Narration or rendering allowance is reserved or used. Try after UTC reset.",
    );
  }
  await emit(c, row, "job.queued");
  return {
    body: job(row),
    status: 202,
    etag: tag("job", row),
    location: "/api/v1/jobs/" + row.id,
  };
}
export async function reserveRetryMedia(
  c: PoolClient,
  row: any,
  allowNew: boolean,
) {
  const v = (
    await c.query(
      "SELECT input_snapshot FROM newbert.project_versions WHERE id=$1",
      [row.version_id],
    )
  ).rows[0]!;
  const manifest = speechManifest(v.input_snapshot, speechConfig());
  if (row.provider_binding?.speechFingerprint !== manifest.fingerprint)
    throw new DomainError(
      409,
      "PROVIDER_CHANGED",
      "The provider binding changed. Submit a fresh approved production request.",
    );
  const reused = await savedNarration(
    c,
    row.workspace_id,
    manifest.fingerprint,
  );
  if (!allowNew && !reused)
    throw new DomainError(
      409,
      "NARRATION_NOT_REUSABLE",
      "Validated saved narration is unavailable. Explicit new-provider consent is required.",
    );
  await c.query(
    "UPDATE newbert.generation_jobs SET provider_binding=provider_binding||$2::jsonb WHERE id=$1",
    [row.id, JSON.stringify({allowNewSpeech: !reused && allowNew})],
  );
  const limits = (
    await c.query("SELECT * FROM newbert.production_limits WHERE singleton")
  ).rows[0]!;
  try {
    for (const [resource, units] of [
      ["provider_credits", reused ? 0 : manifest.characters],
      ["narration_ms", reused ? 0 : Number(limits.max_duration_ms)],
      ["render_ms", Number(limits.max_duration_ms)],
    ] as const)
      await c.query("SELECT newbert.reserve_media_resource($1,$2,$3)", [
        row.id,
        resource,
        units,
      ]);
  } catch {
    throw new DomainError(
      429,
      "MEDIA_ALLOWANCE_EXHAUSTED",
      "Daily speech or render allowance is reserved or used.",
    );
  }
}
