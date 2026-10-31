import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { DomainError } from "../projects/core.js";

export async function policy(c: PoolClient) {
  return (
    await c.query("SELECT * FROM newbert.processing_policy WHERE singleton")
  ).rows[0]!;
}
export async function reserve(
  c: PoolClient,
  workspaceId: string,
  jobId: string,
) {
  const p = await policy(c);
  if (!p.admission_enabled)
    throw new DomainError(
      503,
      "ADMISSION_PAUSED",
      "New processing requests are temporarily paused. Your draft is safe.",
    );
  await c.query(
    `INSERT INTO newbert.usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units)
    VALUES($1,$2,'generation_count',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC',$3)
    ON CONFLICT(workspace_id,resource,period_start) DO NOTHING`,
    [randomUUID(), workspaceId, p.workspace_daily_jobs],
  );
  const b = (
    await c.query(`SELECT * FROM newbert.usage_buckets WHERE resource='generation_count'
    AND period_start=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FOR UPDATE`)
  ).rows[0]!;
  if (
    Number(b.used_units) + Number(b.reserved_units) + 1 >
    Math.min(Number(b.limit_units), p.workspace_daily_jobs)
  )
    throw new DomainError(
      429,
      "ALLOWANCE_EXHAUSTED",
      "Your daily processing allowance is reserved or used. Cancel a waiting request or try after the UTC reset.",
    );
  await c.query(
    "UPDATE newbert.usage_buckets SET reserved_units=reserved_units+1 WHERE id=$1",
    [b.id],
  );
  await c.query(
    `INSERT INTO newbert.usage_reservations(id,workspace_id,job_id,bucket_id,reservation_key,reserved_units) VALUES($1,$2,$3,$4,'admission',1)`,
    [randomUUID(), workspaceId, jobId, b.id],
  );
  try {
    await c.query("SELECT newbert.reserve_platform($1)", [jobId]);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      ["PLATFORM_CAPACITY", "ADMISSION_PAUSED"].includes(String(e.message))
    )
      throw new DomainError(
        503,
        "PLATFORM_CAPACITY",
        "The pilot has reached its processing capacity. Your draft is saved; please try later.",
      );
    throw e;
  }
}
export async function emit(c: PoolClient, row: QueryResultRow, event: string) {
  await c.query(
    `INSERT INTO newbert.outbox_events(id,workspace_id,event_key,event_type,aggregate_type,aggregate_id,payload) VALUES($1,$2,$3,$4,'job',$5,$6)`,
    [
      randomUUID(),
      row.workspace_id,
      row.id + ":" + event + ":" + row.revision,
      event,
      row.id,
      JSON.stringify({ jobId: row.id }),
    ],
  );
}
export async function settle(
  c: PoolClient,
  row: QueryResultRow,
  actual: 0 | 1,
) {
  const reservations = (
    await c.query(
      "SELECT r.* FROM newbert.usage_reservations r JOIN newbert.usage_buckets b ON b.id=r.bucket_id WHERE r.job_id=$1 AND r.status='reserved' AND b.resource='generation_count' ORDER BY r.id FOR UPDATE OF r",
      [row.id],
    )
  ).rows;
  for (const r of reservations) {
    await c.query(
      "UPDATE newbert.usage_buckets SET reserved_units=reserved_units-$1,used_units=used_units+$2 WHERE id=$3",
      [r.reserved_units, actual, r.bucket_id],
    );
    await c.query(
      "UPDATE newbert.usage_reservations SET status=$1,actual_units=$2,settled_at=now() WHERE id=$3",
      [actual ? "settled" : "released", actual, r.id],
    );
    if (actual)
      await c.query(
        `INSERT INTO newbert.usage_entries(id,workspace_id,reservation_id,event_key,entry_type,units_delta,reason_code) VALUES($1,$2,$3,$4,'incurred',$5,'completed_processing') ON CONFLICT(workspace_id,event_key) DO NOTHING`,
        [randomUUID(), row.workspace_id, r.id, row.id + ":completion", actual],
      );
  }
  await c.query("SELECT newbert.settle_platform($1,$2)", [row.id, actual]);
  if(row.kind==='produce')for(const resource of ['provider_credits','narration_ms','render_ms'])await c.query('SELECT newbert.settle_media_resource($1,$2,0)',[row.id,resource]);
}
async function transaction<T>(pool: Pool, work: (c: PoolClient) => Promise<T>) {
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
export interface Lease {
  id: string;
  workspace_id: string;
  project_id: string;
  version_id: string;
  lease_token: string;
  lease_owner: string;
  kind: string;
  [key: string]: unknown;
}
// Global admission/claim lock keeps concurrency exact; SKIP LOCKED and last-claimed
// ordering provide round-robin opportunity between workspaces without Redis.
export async function claimNext(
  pool: Pool,
  owner: string,
  seconds = 30,
): Promise<Lease | null> {
  return transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(1793318406)");
    const p = await policy(c);
    if (!p.processing_enabled) return null;
    const active = Number(
      (
        await c.query(
          "SELECT count(*) AS n FROM newbert.generation_jobs WHERE state='running'",
        )
      ).rows[0].n,
    );
    if (active >= p.global_concurrency) return null;
    const candidate = (
      await c.query(
        `SELECT j.* FROM newbert.generation_jobs j JOIN newbert.workspace_dispatch d ON d.workspace_id=j.workspace_id
    WHERE j.state='queued' AND j.eligible_at<=now() AND d.active_count<$1
    ORDER BY d.last_claimed_at NULLS FIRST,j.created_at,j.id FOR UPDATE OF j,d SKIP LOCKED LIMIT 1`,
        [p.workspace_concurrency],
      )
    ).rows[0];
    if (!candidate) return null;
    const row = (
      await c.query(
        `UPDATE newbert.generation_jobs SET state='running',lease_owner=$2,lease_expires_at=now()+$3*interval '1 second',lease_token=lease_token+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [candidate.id, owner, seconds],
      )
    ).rows[0]!;
    await c.query(
      "UPDATE newbert.workspace_dispatch SET active_count=active_count+1,last_claimed_at=now() WHERE workspace_id=$1",
      [row.workspace_id],
    );
    await c.query(
      "UPDATE newbert.outbox_events SET delivered_at=now(),attempt_count=attempt_count+1 WHERE aggregate_id=$1 AND delivered_at IS NULL",
      [row.id],
    );
    return row as Lease;
  });
}
export async function heartbeat(pool: Pool, lease: Lease, seconds = 30) {
  const r = await pool.query(
    `UPDATE newbert.generation_jobs SET lease_expires_at=now()+$4*interval '1 second' WHERE id=$1 AND state='running' AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() AND cancel_requested_at IS NULL RETURNING id`,
    [lease.id, lease.lease_owner, lease.lease_token, seconds],
  );
  return r.rowCount === 1;
}
export async function finish(
  pool: Pool,
  lease: Lease,
  outcome: "paused" | "succeeded" | "failed" | "cancelled",
  reason?: string,
) {
  return transaction(pool, async (c) => {
    const row = (
      await c.query(
        "SELECT * FROM newbert.generation_jobs WHERE id=$1 AND state='running' AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() FOR UPDATE",
        [lease.id, lease.lease_owner, lease.lease_token],
      )
    ).rows[0];
    if (!row) return false;
    const uncertain = (
      await c.query(
        "SELECT id FROM newbert.job_attempts WHERE job_id=$1 AND state IN ('prepared','submitted','unknown') LIMIT 1",
        [row.id],
      )
    ).rowCount;
    const state = uncertain
      ? "paused"
      : row.cancel_requested_at
        ? "cancelled"
        : outcome;
    const pauseReason = uncertain
      ? "PROVIDER_OUTCOME_UNKNOWN"
      : state === "paused"
        ? reason || "PIPELINE_NOT_READY"
        : null;
    await c.query(
      `UPDATE newbert.generation_jobs SET state=$2,pause_reason=$3,safe_error_code=$4,lease_owner=NULL,lease_expires_at=NULL,revision=revision+1,updated_at=now(),completed_at=CASE WHEN $2 IN ('succeeded','failed','cancelled') THEN now() ELSE NULL END WHERE id=$1`,
      [
        row.id,
        state,
        pauseReason,
        state === "failed" ? reason || "PROCESSING_FAILED" : null,
      ],
    );
    await c.query(
      "UPDATE newbert.workspace_dispatch SET active_count=greatest(0,active_count-1) WHERE workspace_id=$1",
      [row.workspace_id],
    );
    if (["succeeded", "failed", "cancelled"].includes(state))
      await settle(c, { ...row, state }, state === "succeeded" ? 1 : 0);
    return true;
  });
}
export async function recoverExpired(pool: Pool) {
  return transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(1793318406)");
    const rows = (
      await c.query(
        "SELECT * FROM newbert.generation_jobs WHERE state='running' AND lease_expires_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED",
      )
    ).rows;
    for (const row of rows) {
      const uncertain = (
        await c.query(
          "SELECT id FROM newbert.job_attempts WHERE job_id=$1 AND state IN ('prepared','submitted','unknown') LIMIT 1",
          [row.id],
        )
      ).rowCount;
      const recoveryCount =
        Number(row.stage_checkpoint?.recoveryCount || 0) + 1;
      const state = uncertain
        ? "paused"
        : row.cancel_requested_at
          ? "cancelled"
          : recoveryCount >= 3
            ? "paused"
            : "queued";
      await c.query(
        `UPDATE newbert.generation_jobs SET state=$2,pause_reason=$3,stage_checkpoint=stage_checkpoint||$4::jsonb,lease_owner=NULL,lease_expires_at=NULL,lease_token=lease_token+1,revision=revision+1,updated_at=now(),completed_at=CASE WHEN $2='cancelled' THEN now() ELSE NULL END WHERE id=$1`,
        [
          row.id,
          state,
          uncertain
            ? "PROVIDER_OUTCOME_UNKNOWN"
            : state === "paused"
              ? "WORKER_RECOVERY_LIMIT"
              : null,
          JSON.stringify({ recoveryCount }),
        ],
      );
      await c.query(
        "UPDATE newbert.workspace_dispatch SET active_count=greatest(0,active_count-1) WHERE workspace_id=$1",
        [row.workspace_id],
      );
      if (state === "cancelled") await settle(c, { ...row, state }, 0);
    }
    return rows.length;
  });
}
