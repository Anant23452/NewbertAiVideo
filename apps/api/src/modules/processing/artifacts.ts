import { randomUUID } from "node:crypto";
import type { Pool,PoolClient } from "pg";
import { type Lease } from "./queue.js";
import { type LocalMediaStore } from "../../../../../packages/database/src/media.js";

const supported = [
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "application/json",
  "text/plain",
  "text/vtt",
  "image/png",
  "image/jpeg",
];
/** Bytes remain private until the fenced metadata + usage commit succeeds. */
export async function saveArtifact(
  pool: Pool,
  media: LocalMediaStore,
  lease: Lease,
  input: {
    id?: string;
    kind: string;
    mimeType: string;
    bytes: Buffer;
    inputFingerprint: string;
  },
  afterInsert?:(client:PoolClient,artifactId:string)=>Promise<void>,
) {
  if (!supported.includes(input.mimeType))
    throw new Error("Unsupported media type.");
  const artifactId = input.id ?? randomUUID();
  const object = await media.put(lease.workspace_id, artifactId, input.bytes);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const job = (
      await c.query(
        "SELECT id FROM newbert.generation_jobs WHERE id=$1 AND state='running' AND lease_owner=$2 AND lease_token=$3 AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE",
        [lease.id, lease.lease_owner, lease.lease_token],
      )
    ).rows[0];
    if (!job) {
      await c.query("ROLLBACK");
      return null;
    }
    const p = (
      await c.query(
        "SELECT storage_bytes_limit FROM newbert.processing_policy WHERE singleton",
      )
    ).rows[0]!;
    await c.query(
      `INSERT INTO newbert.usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units) VALUES($1,$2,'storage_bytes','1970-01-01Z','9999-01-01Z',$3) ON CONFLICT(workspace_id,resource,period_start) DO NOTHING`,
      [randomUUID(), lease.workspace_id, p.storage_bytes_limit],
    );
    const bucket = (
      await c.query(
        "SELECT * FROM newbert.usage_buckets WHERE workspace_id=$1 AND resource='storage_bytes' AND period_start='1970-01-01Z' FOR UPDATE",
        [lease.workspace_id],
      )
    ).rows[0]!;
    if (
      Number(bucket.used_units) + object.byteSize >
      Math.min(Number(bucket.limit_units), Number(p.storage_bytes_limit))
    )
      throw new Error("STORAGE_CAPACITY");
    await c.query(
      `INSERT INTO newbert.artifacts(id,workspace_id,project_id,version_id,job_id,kind,storage_key,content_hash,input_fingerprint,mime_type,byte_size,validation_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'passed')`,
      [
        artifactId,
        lease.workspace_id,
        lease.project_id,
        lease.version_id,
        lease.id,
        input.kind,
        object.key,
        object.contentHash,
        input.inputFingerprint,
        input.mimeType,
        object.byteSize,
      ],
    );
    await c.query("SELECT newbert.charge_storage($1)", [artifactId]);
    await c.query(
      "UPDATE newbert.usage_buckets SET used_units=used_units+$2 WHERE id=$1",
      [bucket.id, object.byteSize],
    );
    const reservation = randomUUID();
    await c.query(
      `INSERT INTO newbert.usage_reservations(id,workspace_id,job_id,bucket_id,reservation_key,reserved_units,actual_units,status,settled_at) VALUES($1,$2,$3,$4,$5,$6,$6,'settled',now())`,
      [
        reservation,
        lease.workspace_id,
        lease.id,
        bucket.id,
        "artifact:" + artifactId,
        object.byteSize,
      ],
    );
    await c.query(
      `INSERT INTO newbert.usage_entries(id,workspace_id,reservation_id,event_key,entry_type,units_delta,reason_code) VALUES($1,$2,$3,$4,'incurred',$5,'private_storage')`,
      [
        randomUUID(),
        lease.workspace_id,
        reservation,
        "artifact:" + artifactId,
        object.byteSize,
      ],
    );
    if(afterInsert)await afterInsert(c,artifactId);
    await c.query("COMMIT");
    return artifactId;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
