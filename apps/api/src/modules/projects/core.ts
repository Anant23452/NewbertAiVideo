import { createHash, randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a<b?-1:a>b?1:0)
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function id(value: string) {
  if (!uuid(value))
    throw new DomainError(404, "NOT_FOUND", "This item was not found.");
  return value;
}
export const tag = (kind: string, row: QueryResultRow) =>
  `"${kind}:${row.id ?? row.project_id}:${row.revision}"`;
export function match(value: unknown, expected: string) {
  if (!value)
    throw new DomainError(
      428,
      "PRECONDITION_REQUIRED",
      "Load the current item before saving.",
    );
  if (value !== expected)
    throw new DomainError(
      412,
      "STALE_REVISION",
      "This item changed elsewhere. Reload it before trying again.",
    );
}
export function project(row: QueryResultRow) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    revision: Number(row.revision),
    latestOutputArtifactId: row.latest_output_artifact_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export function draft(row: QueryResultRow) {
  return {
    projectId: row.project_id,
    revision: Number(row.revision),
    content: row.content,
    updatedAt: row.updated_at,
  };
}
export function version(row: QueryResultRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.version_number,
    sourceDraftRevision: Number(row.source_draft_revision),
    inputHash: row.input_hash,
    content: row.input_snapshot,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    artifactIds: row.artifact_ids ?? [],
  };
}
export function job(row: QueryResultRow) {
  return {
    id: row.id,
    revision: Number(row.revision),
    projectId: row.project_id,
    versionId: row.version_id,
    kind: row.kind,
    state: row.state,
    stage: row.stage,
    queueStatus:
      row.state === "queued"
        ? "waiting"
        : row.state === "running"
          ? "processing"
          : ["paused", "failed"].includes(row.state)
            ? "attention"
            : "complete",
    pauseReason: row.pause_reason,
    error: row.safe_error_code
      ? {
          code: row.safe_error_code,
          detail:
            "Processing needs attention. No new provider request will be made automatically.",
          retryable: false,
        }
      : null,
    outputArtifactId: row.output_artifact_id,
    cancelRequestedAt: row.cancel_requested_at,
    pollAfterSeconds: 3,
    createdAt: row.created_at,
  };
}
export async function findProject(
  c: PoolClient,
  projectId: string,
  lock = false,
) {
  const r = await c.query(
    `SELECT * FROM newbert.projects WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
    [id(projectId)],
  );
  if (!r.rows[0]) throw new DomainError(404, "NOT_FOUND", "Project not found.");
  return r.rows[0];
}
export async function findDraft(c: PoolClient, projectId: string) {
  const r = await c.query(
    "SELECT * FROM newbert.project_drafts WHERE project_id=$1 FOR UPDATE",
    [projectId],
  );
  if (!r.rows[0]) throw new DomainError(404, "NOT_FOUND", "Draft not found.");
  return r.rows[0];
}
export function active(row: QueryResultRow) {
  if (row.status !== "active")
    throw new DomainError(
      409,
      "PROJECT_ARCHIVED",
      "Restore this project before editing or processing it.",
    );
}
export interface Result {
  body: unknown;
  status?: number;
  etag?: string;
  location?: string;
  replayed?: boolean;
}
export async function command(
  c: PoolClient,
  workspaceId: string,
  operation: string,
  key: unknown,
  request: unknown,
  work: () => Promise<Result>,
): Promise<Result> {
  if (typeof key !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(key))
    throw new DomainError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Provide a valid Idempotency-Key.",
    );
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    workspaceId + ":" + operation + ":" + key,
  ]);
  const requestHash = hash(request);
  const previous = (
    await c.query(
      "SELECT * FROM newbert.idempotency_records WHERE operation=$1 AND client_key=$2",
      [operation, key],
    )
  ).rows[0];
  if (previous) {
    if (previous.request_hash !== requestHash)
      throw new DomainError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used with different input.",
      );
    return {
      ...previous.response_body,
      status: previous.response_status,
      replayed: true,
    };
  }
  const result = await work();
  await c.query(
    `INSERT INTO newbert.idempotency_records(id,workspace_id,operation,client_key,request_hash,response_status,response_body,response_location,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '1 day')`,
    [
      randomUUID(),
      workspaceId,
      operation,
      key,
      requestHash,
      result.status ?? 200,
      JSON.stringify(result),
      result.location ?? null,
    ],
  );
  return result;
}
export function pagination(query: Record<string, unknown>) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new DomainError(
      400,
      "INVALID_PAGE",
      "Choose a page size from 1 to 100.",
    );
  let cursor: { time: string; id: string } | null = null;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== "string" || query.cursor.length > 2048)
        throw new Error();
      cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
      if (
        !cursor ||
        typeof cursor.time !== "string" ||
        cursor.time.length > 80 ||
        !Number.isFinite(Date.parse(cursor.time)) ||
        !uuid(cursor.id)
      )
        throw new Error();
    } catch {
      throw new DomainError(
        400,
        "INVALID_CURSOR",
        "This page cursor is invalid.",
      );
    }
  }
  return { limit, cursor };
}
export function page(
  rows: QueryResultRow[],
  limit: number,
  map: (row: QueryResultRow) => unknown,
) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(map),
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ time: last.cursor_time, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
