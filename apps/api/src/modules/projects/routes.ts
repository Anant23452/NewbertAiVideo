import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withWorkspace } from "../../../../../packages/database/src/client.js";
import { contractSchema } from "../../../../../packages/contracts/src/schema.js";
import {
  current,
  csrfMatches,
  type IdentityRuntime,
} from "../identity/routes.js";
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
  project,
  tag,
  version,
  type Result,
} from "./core.js";
import { emit, policy, reserve, settle } from "../processing/queue.js";
import { registerPlanningRoutes } from "../planning/routes.js";
import type { LocalMediaStore } from "../../../../../packages/database/src/media.js";

type Auth = NonNullable<Awaited<ReturnType<typeof current>>>;
export function registerProjectRoutes(
  app: FastifyInstance,
  database: Pool,
  identity: IdentityRuntime,
  media?: LocalMediaStore,
) {
  app.addSchema(contractSchema);
  function route(
    method: "GET" | "POST" | "PATCH",
    path: string,
    work: (c: PoolClient, r: FastifyRequest, auth: Auth) => Promise<Result>,
    bodySchema?: string,
  ) {
    app.route({
      method,
      url: "/api/v1" + path,
      ...(bodySchema
        ? {
            schema: {
              body: {
                $ref: `https://newbert.local/contract#/definitions/${bodySchema}`,
              },
            },
          }
        : {}),
      handler: async (r, reply) => {
        const auth = await current(r, reply, identity);
        if (!auth) return;
        if (
          method !== "GET" &&
          (r.headers.origin !== identity.config.origin ||
            !csrfMatches(auth.csrfToken, r.headers["x-csrf-token"]))
        )
          return problem(
            reply,
            r,
            403,
            "CSRF_REJECTED",
            "Refresh your session and use the trusted app origin.",
          );
        try {
          const result = await withWorkspace(
            database,
            auth.domain.workspace_id,
            (c) => work(c, r, auth),
          );
          if (result.etag) reply.header("ETag", result.etag);
          if (result.location) reply.header("Location", result.location);
          if (result.replayed) reply.header("Idempotency-Replayed", "true");
          return reply.code(result.status ?? 200).send(result.body);
        } catch (e) {
          if (e instanceof DomainError)
            return problem(reply, r, e.status, e.code, e.message);
          if (e && typeof e === "object" && "code" in e && e.code === "23505")
            return problem(
              reply,
              r,
              409,
              "CONFLICT",
              "An active processing request already exists for this project.",
            );
          throw e;
        }
      },
    });
  }
  const params = (r: FastifyRequest) => r.params as Record<string, string>;
  const query = (r: FastifyRequest) => r.query as Record<string, unknown>;
  registerPlanningRoutes(route, media);
  route("GET", "/projects", async (c, r) => {
    const q = query(r),
      { limit, cursor } = pagination(q);
    const status = q.status ?? "active";
    if (!["active", "archived"].includes(String(status)))
      throw new DomainError(
        400,
        "INVALID_STATUS",
        "Choose active or archived projects.",
      );
    const search = typeof q.search === "string" ? q.search.trim() : "";
    if (search.length > 160)
      throw new DomainError(
        400,
        "INVALID_SEARCH",
        "Search must be at most 160 characters.",
      );
    const rows = (
      await c.query(
        `SELECT *,updated_at::text AS cursor_time FROM newbert.projects WHERE status=$1 AND strpos(lower(title),lower($2))>0 AND ($3::timestamptz IS NULL OR (updated_at,id)<($3::timestamptz,$4::uuid)) ORDER BY updated_at DESC,id DESC LIMIT $5`,
        [status, search, cursor?.time ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    return { body: page(rows, limit, project) };
  });
  route(
    "POST",
    "/projects",
    async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        "create-project",
        r.headers["idempotency-key"],
        r.body,
        async () => {
          const b = r.body as {
            title: string;
            brief: Record<string, unknown>;
            voice?: unknown;
            style?: unknown;
          };
          if (!b.title.trim() || !String(b.brief.topic).trim())
            throw new DomainError(
              422,
              "INVALID_BRIEF",
              "Provide a title and topic.",
            );
          const p = (
            await c.query(
              `INSERT INTO newbert.projects(id,workspace_id,title) VALUES($1,$2,$3) RETURNING *`,
              [randomUUID(), a.domain.workspace_id, b.title.trim()],
            )
          ).rows[0]!;
          const content = {
            schemaVersion: 1,
            brief: b.brief,
            voice: b.voice ?? null,
            style: b.style ?? { preset: "black_glow" },
            scenes: [],
            pronunciationOverrides: [],
            captionOverrides: [],
          };
          await c.query(
            "INSERT INTO newbert.project_drafts(workspace_id,project_id,schema_version,content) VALUES($1,$2,1,$3)",
            [a.domain.workspace_id, p.id, JSON.stringify(content)],
          );
          return {
            body: project(p),
            status: 201,
            etag: tag("project", p),
            location: "/api/v1/projects/" + p.id,
          };
        },
      ),
    "ProjectCreate",
  );
  route("GET", "/projects/:projectId", async (c, r) => {
    const row = await findProject(c, params(r).projectId!);
    return { body: project(row), etag: tag("project", row) };
  });
  route(
    "PATCH",
    "/projects/:projectId",
    async (c, r) => {
      const p = await findProject(c, params(r).projectId!, true);
      match(r.headers["if-match"], tag("project", p));
      const b = r.body as { title?: string; status?: string };
      if (b.title !== undefined && !b.title.trim())
        throw new DomainError(422, "INVALID_TITLE", "A title cannot be empty.");
      if (
        b.status === "archived" &&
        (
          await c.query(
            "SELECT id FROM newbert.generation_jobs WHERE project_id=$1 AND state IN ('queued','running','paused')",
            [p.id],
          )
        ).rowCount
      )
        throw new DomainError(
          409,
          "ACTIVE_JOB",
          "Cancel the active processing request before archiving.",
        );
      const row = (
        await c.query(
          "UPDATE newbert.projects SET title=coalesce($2,title),status=coalesce($3,status),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
          [p.id, b.title?.trim() ?? null, b.status ?? null],
        )
      ).rows[0]!;
      return { body: project(row), etag: tag("project", row) };
    },
    "ProjectPatch",
  );
  route("GET", "/projects/:projectId/draft", async (c, r) => {
    await findProject(c, params(r).projectId!);
    const d = await findDraft(c, params(r).projectId!);
    return { body: draft(d), etag: tag("draft", d) };
  });
  route(
    "PATCH",
    "/projects/:projectId/draft",
    async (c, r) => {
      const p = await findProject(c, params(r).projectId!, true);
      active(p);
      const d = await findDraft(c, p.id);
      match(r.headers["if-match"], tag("draft", d));
      const content = (r.body as { content: unknown }).content;
      const row = (
        await c.query(
          "UPDATE newbert.project_drafts SET content=$2,revision=revision+1,updated_at=now() WHERE project_id=$1 RETURNING *",
          [p.id, JSON.stringify(content)],
        )
      ).rows[0]!;
      await c.query(
        "UPDATE newbert.projects SET updated_at=now(),revision=revision+1 WHERE id=$1",
        [p.id],
      );
      return { body: draft(row), etag: tag("draft", row) };
    },
    "DraftPatch",
  );
  route("GET", "/projects/:projectId/versions", async (c, r) => {
    const p = await findProject(c, params(r).projectId!);
    const { limit, cursor } = pagination(query(r));
    const rows = (
      await c.query(
        `SELECT *,created_at::text AS cursor_time FROM newbert.project_versions WHERE project_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
        [p.id, cursor?.time ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    return { body: page(rows, limit, version) };
  });
  route("GET", "/versions/:versionId", async (c, r) => {
    const v = (
      await c.query(
        "SELECT v.*,ARRAY(SELECT id FROM newbert.artifacts WHERE version_id=v.id AND storage_status='available') AS artifact_ids FROM newbert.project_versions v WHERE v.id=$1",
        [id(params(r).versionId!)],
      )
    ).rows[0];
    if (!v) throw new DomainError(404, "NOT_FOUND", "Version not found.");
    return { body: version(v) };
  });
  route(
    "POST",
    "/projects/:projectId/jobs",
    async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        "submit:" + params(r).projectId,
        r.headers["idempotency-key"],
        { body: r.body, ifMatch: r.headers["if-match"] ?? null },
        async () => {
          const p = await findProject(c, params(r).projectId!, true);
          active(p);
          const d = await findDraft(c, p.id);
          match(r.headers["if-match"], tag("draft", d));
          const b = r.body as {
            kind: string;
            acknowledgedUsageTerms: boolean;
            scriptApproved?: boolean;
          };
          if (!b.acknowledgedUsageTerms)
            throw new DomainError(
              422,
              "CONSENT_REQUIRED",
              "Acknowledge the processing allowance before submitting.",
            );
          if (b.kind === "produce")
            throw new DomainError(
              409,
              "PRODUCTION_NOT_READY",
              "Video production is not connected yet. Save your draft or submit it for the planning queue.",
            );
          if (
            (
              await c.query(
                "SELECT id FROM newbert.generation_jobs WHERE project_id=$1 AND state IN ('queued','running','paused')",
                [p.id],
              )
            ).rowCount
          )
            throw new DomainError(
              409,
              "ACTIVE_JOB",
              "This project already has an active processing request.",
            );
          const v = (
            await c.query(
              `INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8) RETURNING *`,
              [
                randomUUID(),
                a.domain.workspace_id,
                p.id,
                p.next_version_number,
                d.revision,
                JSON.stringify(d.content),
                hash(d.content),
                d.content.brief.mode,
              ],
            )
          ).rows[0]!;
          await c.query(
            "UPDATE newbert.projects SET next_version_number=next_version_number+1,revision=revision+1,updated_at=now() WHERE id=$1",
            [p.id],
          );
          const row = (
            await c.query(
              `INSERT INTO newbert.generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
              [
                randomUUID(),
                a.domain.workspace_id,
                p.id,
                v.id,
                b.kind,
                randomUUID(),
              ],
            )
          ).rows[0]!;
          await reserve(c, a.domain.workspace_id, row.id);
          await emit(c, row, "job.queued");
          return {
            body: job(row),
            status: 202,
            etag: tag("job", row),
            location: "/api/v1/jobs/" + row.id,
          };
        },
      ),
    "JobCreate",
  );
  route("GET", "/jobs", async (c, r) => {
    const q = query(r),
      { limit, cursor } = pagination(q);
    const projectId = typeof q.projectId === "string" ? id(q.projectId) : null;
    const state = q.state ?? null;
    if (
      state !== null &&
      (typeof state !== "string" ||
        ![
          "queued",
          "running",
          "paused",
          "succeeded",
          "failed",
          "cancelled",
        ].includes(state))
    )
      throw new DomainError(
        400,
        "INVALID_STATE",
        "Choose a supported processing state.",
      );
    const rows = (
      await c.query(
        `SELECT *,created_at::text AS cursor_time FROM newbert.generation_jobs WHERE ($1::uuid IS NULL OR project_id=$1) AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) AND ($5::text IS NULL OR state=$5) ORDER BY created_at DESC,id DESC LIMIT $4`,
        [projectId, cursor?.time ?? null, cursor?.id ?? null, limit + 1, state],
      )
    ).rows;
    return { body: page(rows, limit, job) };
  });
  route("GET", "/jobs/:jobId", async (c, r) => {
    const row = (
      await c.query("SELECT * FROM newbert.generation_jobs WHERE id=$1", [
        id(params(r).jobId!),
      ])
    ).rows[0];
    if (!row)
      throw new DomainError(404, "NOT_FOUND", "Processing request not found.");
    return { body: job(row), etag: tag("job", row) };
  });
  for (const action of ["cancel", "resume"] as const)
    route("POST", "/jobs/:jobId/" + action, async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        action + ":" + params(r).jobId,
        r.headers["idempotency-key"],
        { ifMatch: r.headers["if-match"] ?? null },
        async () => {
          let row = (
            await c.query(
              "SELECT * FROM newbert.generation_jobs WHERE id=$1 FOR UPDATE",
              [id(params(r).jobId!)],
            )
          ).rows[0];
          if (!row)
            throw new DomainError(
              404,
              "NOT_FOUND",
              "Processing request not found.",
            );
          match(r.headers["if-match"], tag("job", row));
          if (action === "cancel") {
            if (!["queued", "running", "paused"].includes(row.state))
              throw new DomainError(
                409,
                "TERMINAL_JOB",
                "This request has already finished.",
              );
            if (row.pause_reason === "PROVIDER_OUTCOME_UNKNOWN")
              throw new DomainError(
                409,
                "RECONCILIATION_REQUIRED",
                "The provider outcome must be reconciled before releasing this reservation.",
              );
            const immediate = row.state !== "running";
            row = (
              await c.query(
                `UPDATE newbert.generation_jobs SET cancel_requested_at=now(),state=CASE WHEN $2 THEN 'cancelled' ELSE state END,pause_reason=CASE WHEN $2 THEN NULL ELSE pause_reason END,completed_at=CASE WHEN $2 THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,
                [row.id, immediate],
              )
            ).rows[0]!;
            if (immediate) await settle(c, row, 0);
          } else {
            const p = await policy(c);
            if (!p.admission_enabled || !p.processing_enabled)
              throw new DomainError(
                503,
                "PROCESSING_PAUSED",
                "Processing is temporarily paused.",
              );
            if (
              row.state !== "paused" ||
              row.pause_reason === "PROVIDER_OUTCOME_UNKNOWN" ||
              row.cancel_requested_at
            )
              throw new DomainError(
                409,
                "CANNOT_RESUME",
                "This request cannot be safely resumed.",
              );
            row = (
              await c.query(
                "UPDATE newbert.generation_jobs SET state='queued',pause_reason=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
                [row.id],
              )
            ).rows[0]!;
            await emit(c, row, "job.resumed");
          }
          return {
            body: job(row),
            status: 202,
            etag: tag("job", row),
            location: "/api/v1/jobs/" + row.id,
          };
        },
      ),
    );
  route(
    "POST",
    "/jobs/:jobId/retry",
    async (c, r, a) =>
      command(
        c,
        a.domain.workspace_id,
        "retry:" + params(r).jobId,
        r.headers["idempotency-key"],
        { body: r.body, ifMatch: r.headers["if-match"] ?? null },
        async () => {
          const original = (
            await c.query("SELECT * FROM newbert.generation_jobs WHERE id=$1", [
              id(params(r).jobId!),
            ])
          ).rows[0];
          if (!original)
            throw new DomainError(
              404,
              "NOT_FOUND",
              "Processing request not found.",
            );
          const p = await findProject(c, original.project_id, true);
          active(p);
          const row = (
            await c.query(
              "SELECT * FROM newbert.generation_jobs WHERE id=$1 FOR UPDATE",
              [original.id],
            )
          ).rows[0]!;
          match(r.headers["if-match"], tag("job", row));
          if (!["failed", "cancelled"].includes(row.state))
            throw new DomainError(
              409,
              "CANNOT_RETRY",
              "Only a finished failed or cancelled request can be retried.",
            );
          if (
            (
              await c.query(
                "SELECT id FROM newbert.job_attempts WHERE job_id=$1 AND state IN ('prepared','submitted','unknown') LIMIT 1",
                [row.id],
              )
            ).rowCount
          )
            throw new DomainError(
              409,
              "RECONCILIATION_REQUIRED",
              "Resolve the previous provider outcome before retrying.",
            );
          if (
            !(r.body as { allowNewProviderRequest: boolean })
              .allowNewProviderRequest
          )
            throw new DomainError(
              409,
              "RETRY_CONSENT_REQUIRED",
              "A fresh queue reservation requires explicit retry consent. No provider calls are connected yet.",
            );
          const next = (
            await c.query(
              `INSERT INTO newbert.generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key,retry_of_job_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
              [
                randomUUID(),
                a.domain.workspace_id,
                row.project_id,
                row.version_id,
                row.kind,
                randomUUID(),
                row.id,
              ],
            )
          ).rows[0]!;
          await reserve(c, a.domain.workspace_id, next.id);
          await emit(c, next, "job.queued");
          return {
            body: job(next),
            status: 202,
            etag: tag("job", next),
            location: "/api/v1/jobs/" + next.id,
          };
        },
      ),
    "RetryJob",
  );
  route("GET", "/usage", async (c) => {
    const p = await policy(c);
    const rows = (
      await c.query(
        `SELECT * FROM newbert.usage_buckets WHERE resource='generation_count' AND period_start=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      )
    ).rows;
    const b = rows[0];
    const storage = (
      await c.query(
        "SELECT used_units,limit_units FROM newbert.usage_buckets WHERE resource='storage_bytes' AND period_start='1970-01-01Z'",
      )
    ).rows[0];
    const storageLimit = Math.min(
      Number(storage?.limit_units ?? p.storage_bytes_limit),
      Number(p.storage_bytes_limit),
    );
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const planningUsed = Number(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM newbert.planning_calls WHERE created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
        )
      ).rows[0].n,
    );
    return {
      body: {
        allowanceTimezone: "UTC",
        platformCapacity: (
          await c.query("SELECT newbert.platform_capacity() AS state")
        ).rows[0].state,
        resources: [
          {
            resource: "generation_count",
            limit: Math.min(
              Number(b?.limit_units ?? p.workspace_daily_jobs),
              p.workspace_daily_jobs,
            ),
            used: Number(b?.used_units ?? 0),
            reserved: Number(b?.reserved_units ?? 0),
            remaining: Math.max(
              0,
              Math.min(
                Number(b?.limit_units ?? p.workspace_daily_jobs),
                p.workspace_daily_jobs,
              ) -
                Number(b?.used_units ?? 0) -
                Number(b?.reserved_units ?? 0),
            ),
            periodStart: b?.period_start ?? start,
            resetsAt: b?.period_end ?? end,
          },
          {
            resource: "storage_bytes",
            limit: storageLimit,
            used: Number(storage?.used_units ?? 0),
            reserved: 0,
            remaining: Math.max(
              0,
              storageLimit - Number(storage?.used_units ?? 0),
            ),
            periodStart: "1970-01-01T00:00:00.000Z",
            resetsAt: null,
          },
          {
            resource: "provider_credits",
            limit: 2,
            used: planningUsed,
            reserved: 0,
            remaining: Math.max(0, 2 - planningUsed),
            periodStart: start,
            resetsAt: end,
          },
        ],
      },
    };
  });
  route("GET", "/usage/entries", async (c, r) => {
    const { limit, cursor } = pagination(query(r));
    const rows = (
      await c.query(
        `SELECT e.*,e.created_at::text AS cursor_time,r.job_id,b.resource FROM newbert.usage_entries e JOIN newbert.usage_reservations r ON r.id=e.reservation_id JOIN newbert.usage_buckets b ON b.id=r.bucket_id WHERE ($1::timestamptz IS NULL OR (e.created_at,e.id)<($1::timestamptz,$2::uuid)) ORDER BY e.created_at DESC,e.id DESC LIMIT $3`,
        [cursor?.time ?? null, cursor?.id ?? null, limit + 1],
      )
    ).rows;
    return {
      body: page(rows, limit, (row) => ({
        id: row.id,
        jobId: row.job_id,
        resource: row.resource,
        unitsDelta: Number(row.units_delta),
        providerUnits:
          row.provider_units === null ? null : Number(row.provider_units),
        providerUnit: row.provider_unit,
        reasonCode: row.reason_code,
        createdAt: row.created_at,
      })),
    };
  });
}
export function problem(
  reply: FastifyReply,
  r: FastifyRequest,
  status: number,
  code: string,
  detail: string,
) {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({
      type: "about:blank",
      title: code.replaceAll("_", " "),
      status,
      code,
      detail,
      requestId: r.id,
    });
}
