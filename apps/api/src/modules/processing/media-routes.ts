import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { withWorkspace } from "../../../../../packages/database/src/client.js";
import { LocalMediaStore } from "../../../../../packages/database/src/media.js";
import {
  current,
  csrfMatches,
  type IdentityRuntime,
} from "../identity/routes.js";
import { command, DomainError, id } from "../projects/core.js";
import { problem } from "../projects/routes.js";
const metadata = (a: Record<string, unknown>) => ({
  id: a.id,
  projectId: a.project_id,
  versionId: a.version_id,
  jobId: a.job_id,
  kind: a.kind,
  mimeType: a.mime_type,
  bytes: Number(a.byte_size),
  sha256: a.content_hash,
  durationMs: a.duration_ms === null ? null : Number(a.duration_ms),
  validationStatus: a.validation_status,
  storageStatus: a.storage_status,
  createdAt: a.created_at,
});
export function registerMediaRoutes(
  app: FastifyInstance,
  pool: Pool,
  identity: IdentityRuntime,
  media: LocalMediaStore,
) {
  const signature = (
    artifactId: string,
    workspaceId: string,
    csrf: string,
    expires: string,
    purpose: string,
  ) =>
    createHmac("sha256", identity.config.secret)
      .update([artifactId, workspaceId, csrf, expires, purpose].join(":"))
      .digest("hex");
  for (const access of [false, true])
    app.route({
      method: access ? "POST" : "GET",
      url: "/api/v1/artifacts/:artifactId" + (access ? "/access" : ""),
      ...(access
        ? {
            schema: {
              body: {
                $ref: "https://newbert.local/contract#/definitions/AccessRequest",
              },
            },
          }
        : {}),
      handler: async (r, reply) => {
        const auth = await current(r, reply, identity);
        if (!auth) return;
        if (
          access &&
          (r.headers.origin !== identity.config.origin ||
            !csrfMatches(auth.csrfToken, r.headers["x-csrf-token"]))
        )
          return problem(
            reply,
            r,
            403,
            "CSRF_REJECTED",
            "Refresh your session and use the trusted app.",
          );
        try {
          const result = await withWorkspace(
            pool,
            auth.domain.workspace_id,
            async (c) => {
              const artifactId = id(
                (r.params as { artifactId: string }).artifactId,
              );
              const a = (
                await c.query(
                  "SELECT * FROM newbert.artifacts WHERE id=$1 AND storage_status='available'",
                  [artifactId],
                )
              ).rows[0];
              if (!a || (access && a.validation_status !== "passed"))
                throw new DomainError(404, "NOT_FOUND", "Media not found.");
              if (!access) return { body: metadata(a) };
              return command(
                c,
                auth.domain.workspace_id,
                "media-access:" + artifactId,
                r.headers["idempotency-key"],
                r.body,
                async () => {
                  const purpose = (r.body as { purpose: string }).purpose;
                  const expires = String(Math.floor(Date.now() / 1000) + 120);
                  const sig = signature(
                    artifactId,
                    auth.domain.workspace_id,
                    auth.csrfToken,
                    expires,
                    purpose,
                  );
                  return {
                    body: {
                      url:
                        identity.config.origin +
                        `/api/v1/media/${artifactId}?expires=${expires}&purpose=${purpose}&signature=${sig}`,
                      expiresAt: new Date(Number(expires) * 1000).toISOString(),
                      mimeType: a.mime_type,
                    },
                  };
                },
              );
            },
          );
          if (result.replayed) reply.header("Idempotency-Replayed", "true");
          return reply.send(result.body);
        } catch (e) {
          if (e instanceof DomainError)
            return problem(reply, r, e.status, e.code, e.message);
          throw e;
        }
      },
    });
  app.get("/api/v1/media/:artifactId", async (r, reply) => {
    const auth = await current(r, reply, identity);
    if (!auth) return;
    const q = r.query as Record<string, string>;
    const artifactId = (r.params as { artifactId: string }).artifactId;
    if (
      !/^\d{10}$/.test(q.expires || "") ||
      Number(q.expires) < Date.now() / 1000 ||
      Number(q.expires) > Date.now() / 1000 + 125 ||
      !["preview", "download"].includes(q.purpose || "") ||
      !/^[a-f0-9]{64}$/.test(q.signature || "")
    )
      return problem(
        reply,
        r,
        403,
        "ACCESS_EXPIRED",
        "Request a new media link.",
      );
    const expected = signature(
      artifactId,
      auth.domain.workspace_id,
      auth.csrfToken,
      q.expires!,
      q.purpose!,
    );
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(q.signature!)))
      return problem(
        reply,
        r,
        403,
        "ACCESS_REJECTED",
        "Request a media link from your own workspace.",
      );
    try {
      const a = await withWorkspace(
        pool,
        auth.domain.workspace_id,
        async (c) =>
          (
            await c.query(
              "SELECT * FROM newbert.artifacts WHERE id=$1 AND storage_status='available' AND validation_status='passed'",
              [id(artifactId)],
            )
          ).rows[0],
      );
      if (!a) throw new DomainError(404, "NOT_FOUND", "Media not found.");
      const bytes = await media.get(a.storage_key);
      if (bytes.length !== Number(a.byte_size))
        throw new Error("Object size mismatch.");
      if (createHash("sha256").update(bytes).digest("hex") !== a.content_hash)
        throw new Error("Object hash mismatch.");
      if (
        ![
          "video/mp4",
          "audio/mpeg",
          "audio/wav",
          "application/json",
          "text/plain",
          "text/vtt",
          "image/png",
          "image/jpeg",
        ].includes(a.mime_type)
      )
        throw new Error("Unsupported private media type.");
      reply
        .type(a.mime_type)
        .header("Accept-Ranges", "bytes")
        .header(
          "Content-Disposition",
          `${q.purpose === "download" ? "attachment" : "inline"}; filename="${artifactId}.${a.mime_type === "video/mp4" ? "mp4" : a.mime_type === "audio/mpeg" ? "mp3" : "bin"}"`,
        );
      if (r.headers.range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(r.headers.range);
        if (
          !m ||
          Number(m[1]) >= bytes.length ||
          (m[2] && Number(m[2]) < Number(m[1]))
        )
          return reply
            .code(416)
            .header("Content-Range", `bytes */${bytes.length}`)
            .send();
        const start = Number(m[1]),
          end = m[2]
            ? Math.min(Number(m[2]), bytes.length - 1)
            : bytes.length - 1;
        return reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${bytes.length}`)
          .send(bytes.subarray(start, end + 1));
      }
      return reply.send(bytes);
    } catch (e) {
      if (e instanceof DomainError)
        return problem(reply, r, e.status, e.code, e.message);
      return problem(
        reply,
        r,
        404,
        "MEDIA_UNAVAILABLE",
        "This private object is unavailable.",
      );
    }
  });
}
