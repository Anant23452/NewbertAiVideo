import type { Register } from "../planning/routes.js";
import { findProject, job, uuid } from "../projects/core.js";
export function registerProductionRoutes(route: Register) {
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
