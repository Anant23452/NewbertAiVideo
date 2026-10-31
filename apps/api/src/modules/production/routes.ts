import type { Register } from "../planning/routes.js";
import {
  active,
  command,
  DomainError,
  draft,
  findDraft,
  findProject,
  id,
  job,
  match,
  page,
  pagination,
  tag,
  uuid,
} from "../projects/core.js";
export function registerProductionRoutes(route: Register) {
  route("GET", "/projects/:projectId/outputs", async (c, r) => {
    const p = await findProject(c, (r.params as any).projectId);
    const { limit, cursor } = pagination(r.query as Record<string, unknown>);
    const rows = (
      await c.query(
        `SELECT a.*,a.created_at::text AS cursor_time,v.version_number,j.state AS job_state,
      (SELECT d.id FROM newbert.artifact_dependencies x JOIN newbert.artifacts d ON d.id=x.depends_on_id WHERE x.artifact_id=a.id AND d.kind='captions' AND d.storage_status='available' AND d.validation_status='passed' LIMIT 1) AS captions_id
      FROM newbert.artifacts a JOIN newbert.project_versions v ON v.id=a.version_id JOIN newbert.generation_jobs j ON j.id=a.job_id
      WHERE j.state='succeeded' AND j.output_artifact_id=a.id AND a.project_id=$1 AND a.kind='video' AND a.validation_status='passed' AND a.storage_status='available'
      AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2::timestamptz,$3::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT $4`,
        [p.id, cursor?.time ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    return {
      body: {
        ...page(rows, limit, (a) => ({
          id: a.id,
          versionId: a.version_id,
          versionNumber: a.version_number,
          jobId: a.job_id,
          jobState: a.job_state,
          durationMs: Number(a.duration_ms),
          bytes: Number(a.byte_size),
          createdAt: a.created_at,
          captionsId: a.captions_id,
          latestGood: a.id === p.latest_output_artifact_id,
          nonCommercial: true,
          attributionRequired: true,
        })),
        latestOutputArtifactId: p.latest_output_artifact_id,
      },
    };
  });
  route(
    "POST",
    "/versions/:versionId/restore",
    async (c, r, a) => {
      const versionId = id((r.params as any).versionId);
      return command(
        c,
        a.domain.workspace_id,
        "restore-version:" + versionId,
        r.headers["idempotency-key"],
        { body: r.body, etag: r.headers["if-match"] },
        async () => {
          const v = (
            await c.query(
              "SELECT * FROM newbert.project_versions WHERE id=$1",
              [versionId],
            )
          ).rows[0];
          if (!v) throw new DomainError(404, "NOT_FOUND", "Version not found.");
          const p = await findProject(c, v.project_id, true);
          active(p);
          const d = await findDraft(c, p.id);
          match(r.headers["if-match"], tag("draft", d));
          const row = (
            await c.query(
              "UPDATE newbert.project_drafts SET content=$2,revision=revision+1,updated_at=now() WHERE project_id=$1 RETURNING *",
              [p.id, JSON.stringify(v.input_snapshot)],
            )
          ).rows[0];
          await c.query(
            "UPDATE newbert.projects SET revision=revision+1,updated_at=now() WHERE id=$1",
            [p.id],
          );
          return { body: draft(row), etag: tag("draft", row) };
        },
      );
    },
    "VersionRestore",
  );
  route("GET", "/projects/:projectId/production", async (c, r) => {
    const p = await findProject(
      c,
      (r.params as { projectId: string }).projectId,
    );
    const row = (
      await c.query(
        "SELECT * FROM newbert.generation_jobs WHERE project_id=$1 AND kind='produce' ORDER BY created_at DESC,id DESC LIMIT 1",
        [p.id],
      )
    ).rows[0];
    const limits = (
      await c.query(
        "SELECT max_duration_ms,max_characters FROM newbert.production_limits WHERE singleton",
      )
    ).rows[0]!;
    if (!row)
      return {
        body: {
          job: null,
          ready: false,
          artifacts: [],
          limits: {
            maxDurationMs: Number(limits.max_duration_ms),
            maxSpokenCharacters: limits.max_characters,
          },
          nonCommercial: true,
          attributionRequired: true,
        },
      };
    const ids = Object.entries(row.stage_checkpoint)
      .filter(
        ([k, v]) =>
          [
            "audioId",
            "alignmentId",
            "compositionId",
            "videoId",
            "captionsId",
            "reportId",
          ].includes(k) &&
          typeof v === "string" &&
          uuid(v),
      )
      .map(([, v]) => v);
    const artifacts = ids.length
      ? (
          await c.query(
            "SELECT id,kind,mime_type,duration_ms,byte_size,validation_status FROM newbert.artifacts WHERE id=ANY($1::uuid[]) AND storage_status='available' AND validation_status='passed'",
            [ids],
          )
        ).rows
      : [];
    return {
      body: {
        job: job(row),
        ready:
          row.state === "succeeded" &&
          artifacts.some(
            (a) => a.id === row.output_artifact_id && a.kind === "video",
          ),
        artifacts: artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          mimeType: a.mime_type,
          durationMs: a.duration_ms === null ? null : Number(a.duration_ms),
          bytes: Number(a.byte_size),
        })),
        limits: {
          maxDurationMs: Number(limits.max_duration_ms),
          maxSpokenCharacters: limits.max_characters,
        },
        nonCommercial: true,
        attributionRequired: true,
      },
    };
  });
}
