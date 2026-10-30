import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
import {
  claimNext,
  finish,
  heartbeat,
  recoverExpired,
} from "../../apps/api/src/modules/processing/queue.js";
import { withWorkspace } from "../../packages/database/src/client.js";
import { saveArtifact } from "../../apps/api/src/modules/processing/artifacts.js";
let h: Awaited<ReturnType<typeof platform>>;
before(
  async () => {
    h = await platform();
  },
  { timeout: 180000 },
);
after(async () => {
  await h?.close();
});
beforeEach(async () => {
  // This harness owns a newly created, isolated PostgreSQL cluster/database.
  await h.db.query(
    "TRUNCATE newbert.projects,newbert.usage_buckets,newbert.platform_budgets,newbert.outbox_events,newbert.idempotency_records CASCADE",
  );
  await h.db.query(
    "UPDATE newbert.workspace_dispatch SET active_count=0,last_claimed_at=NULL",
  );
  await h.db.query(
    "UPDATE newbert.processing_policy SET admission_enabled=true,processing_enabled=true,workspace_daily_jobs=3,platform_daily_jobs=20,global_concurrency=2,workspace_concurrency=1,storage_bytes_limit=10485760,platform_storage_bytes_limit=104857600",
  );
});
type User = Awaited<ReturnType<Awaited<ReturnType<typeof platform>>["user"]>>;
async function seed(u: User) {
  const p = await h.call(
    "/api/v1/projects",
    "POST",
    { title: "Queue fixture", brief },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "Idempotency-Key": randomUUID() },
  );
  assert.equal(p.statusCode, 201, p.body);
  const prefix = "/api/v1/projects/" + p.json().id;
  const d = await h.call(prefix + "/draft", "GET", undefined, u.cookie);
  return { prefix, etag: String(d.headers.etag) };
}
async function submit(
  u: User,
  s?: Awaited<ReturnType<typeof seed>>,
  key = randomUUID(),
) {
  s ??= await seed(u);
  return h.call(
    s.prefix + "/jobs",
    "POST",
    { kind: "plan", acknowledgedUsageTerms: true },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "Idempotency-Key": key, "If-Match": s.etag },
  );
}
async function cancel(u: User, jobId: string) {
  const r = await h.call("/api/v1/jobs/" + jobId, "GET", undefined, u.cookie);
  return h.call("/api/v1/jobs/" + jobId + "/cancel", "POST", {}, u.cookie, {
    "X-CSRF-Token": u.csrf,
    "Idempotency-Key": randomUUID(),
    "If-Match": String(r.headers.etag),
  });
}
test("concurrent identical submission commits one version, reservation, job and outbox record", async () => {
  const u = await h.user(),
    s = await seed(u),
    key = randomUUID();
  const [a, b] = await Promise.all([submit(u, s, key), submit(u, s, key)]);
  assert.equal(a.statusCode, 202, a.body);
  assert.equal(b.statusCode, 202, b.body);
  assert.equal(a.json().id, b.json().id);
  for (const table of [
    "project_versions",
    "generation_jobs",
    "usage_reservations",
    "outbox_events",
  ])
    assert.equal(
      (await h.db.query("SELECT count(*)::int AS n FROM newbert." + table))
        .rows[0].n,
      1,
    );
  assert.equal(
    (await h.db.query("SELECT reserved_units FROM newbert.platform_budgets"))
      .rows[0].reserved_units,
    "1",
  );
});
test("job state filtering preserves pagination and rejects unsupported states", async () => {
  const u = await h.user();
  const cancelled = await submit(u);
  assert.equal((await cancel(u, cancelled.json().id)).statusCode, 202);
  const queued = [await submit(u), await submit(u)];
  const first = await h.call("/api/v1/jobs?state=queued&limit=1", "GET", undefined, u.cookie);
  assert.equal(first.statusCode, 200, first.body);
  assert.equal(first.json().items.length, 1);
  assert.equal(first.json().items[0].state, "queued");
  assert.ok(first.json().nextCursor);
  const next = await h.call("/api/v1/jobs?state=queued&limit=1&cursor=" + encodeURIComponent(first.json().nextCursor), "GET", undefined, u.cookie);
  assert.deepEqual(new Set([first.json().items[0].id, next.json().items[0].id]), new Set(queued.map(r => r.json().id)));
  assert.equal(next.json().nextCursor, null);
  const terminal = await h.call("/api/v1/jobs?state=cancelled", "GET", undefined, u.cookie);
  assert.deepEqual(terminal.json().items.map((j: {id:string}) => j.id), [cancelled.json().id]);
  for (const query of ["state=invalid", "state=queued&state=cancelled"])
    assert.equal((await h.call("/api/v1/jobs?" + query, "GET", undefined, u.cookie)).statusCode, 400);
});

test("workspace quota admission is atomic under concurrency; failed admission creates no orphan version or event", async () => {
  const u = await h.user();
  const seeds = await Promise.all(Array.from({ length: 5 }, () => seed(u)));
  const responses = await Promise.all(seeds.map((s) => submit(u, s)));
  assert.equal(responses.filter((r) => r.statusCode === 202).length, 3);
  assert.equal(responses.filter((r) => r.statusCode === 429).length, 2);
  for (const table of ["project_versions", "generation_jobs", "outbox_events"])
    assert.equal(
      (await h.db.query("SELECT count(*)::int AS n FROM newbert." + table))
        .rows[0].n,
      3,
    );
  const usage = (
    await h.call("/api/v1/usage", "GET", undefined, u.cookie)
  ).json().resources[0];
  assert.equal(usage.reserved, 3);
  assert.equal(usage.remaining, 0);
  assert.equal(usage.used, 0);
});
test("global capacity and operator pause reject admission without tenant debit", async () => {
  await h.db.query(
    "UPDATE newbert.processing_policy SET platform_daily_jobs=1",
  );
  const a = await h.user(),
    b = await h.user();
  assert.equal((await submit(a)).statusCode, 202);
  const rejected = await submit(b);
  assert.equal(rejected.statusCode, 503, rejected.body);
  assert.equal(
    (await h.call("/api/v1/usage", "GET", undefined, b.cookie)).json()
      .resources[0].reserved,
    0,
  );
  await h.db.query(
    "UPDATE newbert.processing_policy SET admission_enabled=false",
  );
  assert.equal((await submit(b)).statusCode, 503);
});
test("cancel queued job releases workspace/platform reservations once; replay does not double release", async () => {
  const u = await h.user(),
    r = await submit(u);
  assert.equal(r.statusCode, 202, r.body);
  const cancelled = await cancel(u, r.json().id);
  assert.equal(cancelled.statusCode, 202, cancelled.body);
  assert.equal(cancelled.json().state, "cancelled");
  assert.equal(
    (await h.call("/api/v1/usage", "GET", undefined, u.cookie)).json()
      .resources[0].reserved,
    0,
  );
  assert.equal(
    (await h.db.query("SELECT reserved_units FROM newbert.platform_budgets"))
      .rows[0].reserved_units,
    "0",
  );
  assert.equal((await cancel(u, r.json().id)).statusCode, 409);
});
test("worker claims fairly across workspaces, enforces both concurrency caps and consumes durable outbox", async () => {
  const a = await h.user(),
    b = await h.user();
  await submit(a);
  await submit(a);
  await submit(b);
  const [one, two, three] = await Promise.all([
    claimNext(h.worker, "one"),
    claimNext(h.worker, "two"),
    claimNext(h.worker, "three"),
  ]);
  const leases = [one, two, three].filter(Boolean);
  assert.equal(leases.length, 2);
  assert.notEqual(leases[0]!.workspace_id, leases[1]!.workspace_id);
  assert.equal(
    (
      await h.db.query(
        "SELECT count(*)::int AS n FROM newbert.outbox_events WHERE delivered_at IS NOT NULL",
      )
    ).rows[0].n,
    2,
  );
});
test("expired leases requeue safely, fence old workers and preserve the reservation", async () => {
  const u = await h.user();
  await submit(u);
  const old = await claimNext(h.worker, "old");
  assert.ok(old);
  await h.db.query(
    "UPDATE newbert.generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [old.id],
  );
  assert.equal(await recoverExpired(h.worker), 1);
  assert.equal(await finish(h.worker, old, "succeeded"), false);
  const next = await claimNext(h.worker, "next");
  assert.ok(next);
  assert.ok(BigInt(next.lease_token) > BigInt(old.lease_token));
  assert.equal(await heartbeat(h.worker, old), false);
  assert.equal(await heartbeat(h.worker, next), true);
  assert.equal(
    await finish(h.worker, next, "paused", "PIPELINE_NOT_READY"),
    true,
  );
  assert.equal(
    (await h.call("/api/v1/usage", "GET", undefined, u.cookie)).json()
      .resources[0].reserved,
    1,
  );
});
test("unknown provider outcome pauses recovery and prevents automatic replay or cancellation release", async () => {
  const u = await h.user();
  await submit(u);
  const lease = await claimNext(h.worker, "uncertain");
  assert.ok(lease);
  await h.db.query(
    `INSERT INTO newbert.job_attempts(id,workspace_id,job_id,stage,attempt_number,state,request_fingerprint,lease_token) VALUES($1,$2,$3,'scripting',1,'submitted',$4,$5)`,
    [randomUUID(), u.workspaceId, lease.id, "0".repeat(64), lease.lease_token],
  );
  await h.db.query(
    "UPDATE newbert.generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [lease.id],
  );
  await recoverExpired(h.worker);
  const row = (
    await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, u.cookie)
  ).json();
  assert.equal(row.state, "paused");
  assert.equal(row.pauseReason, "PROVIDER_OUTCOME_UNKNOWN");
  assert.equal(await claimNext(h.worker, "no-replay"), null);
  assert.equal((await cancel(u, lease.id)).statusCode, 409);
});
test("running cancellation is cooperative and releases only after worker acknowledgement", async () => {
  const u = await h.user();
  await submit(u);
  const lease = await claimNext(h.worker, "running");
  assert.ok(lease);
  const r = await cancel(u, lease.id);
  assert.equal(r.json().state, "running");
  assert.ok(r.json().cancelRequestedAt);
  assert.equal(await heartbeat(h.worker, lease), false);
  assert.equal(await finish(h.worker, lease, "succeeded"), true);
  assert.equal(
    (
      await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, u.cookie)
    ).json().state,
    "cancelled",
  );
  assert.equal(
    (await h.call("/api/v1/usage", "GET", undefined, u.cookie)).json()
      .resources[0].reserved,
    0,
  );
});
test("terminal worker settlement is exactly once and writes an incurred usage entry", async () => {
  const u = await h.user();
  await submit(u);
  const lease = await claimNext(h.worker, "complete");
  assert.ok(lease);
  assert.equal(await finish(h.worker, lease, "succeeded"), true);
  assert.equal(await finish(h.worker, lease, "succeeded"), false);
  const r = (await h.call("/api/v1/usage", "GET", undefined, u.cookie)).json()
    .resources[0];
  assert.equal(r.used, 1);
  assert.equal(r.reserved, 0);
  assert.equal(
    (await h.call("/api/v1/usage/entries", "GET", undefined, u.cookie)).json()
      .items.length,
    1,
  );
});
test("retry requires consent, stays on original version and reserves a new command once", async () => {
  const u = await h.user();
  const original = await submit(u);
  await cancel(u, original.json().id);
  const row = await h.call(
    "/api/v1/jobs/" + original.json().id,
    "GET",
    undefined,
    u.cookie,
  );
  const path = "/api/v1/jobs/" + original.json().id + "/retry",
    headers = {
      "X-CSRF-Token": u.csrf,
      "If-Match": String(row.headers.etag),
      "Idempotency-Key": randomUUID(),
    };
  assert.equal(
    (
      await h.call(
        path,
        "POST",
        { allowNewProviderRequest: false },
        u.cookie,
        headers,
      )
    ).statusCode,
    409,
  );
  headers["Idempotency-Key"] = randomUUID();
  const retry = await h.call(
    path,
    "POST",
    { allowNewProviderRequest: true },
    u.cookie,
    headers,
  );
  assert.equal(retry.statusCode, 202, retry.body);
  assert.equal(retry.json().versionId, original.json().versionId);
  assert.notEqual(retry.json().id, original.json().id);
  assert.equal(
    (
      await h.call(
        path,
        "POST",
        { allowNewProviderRequest: true },
        u.cookie,
        headers,
      )
    ).json().id,
    retry.json().id,
  );
});
test("private media is immutable, signed, session/owner-bound, ranged and not exposed as storage keys", async () => {
  const u = await h.user(),
    other = await h.user();
  const submitted = await submit(u);
  const lease = await claimNext(h.worker, "media");
  assert.ok(lease);
  const artifactId = randomUUID();
  const bytes = Buffer.from("private sample media");
  const object = await h.media.put(u.workspaceId, artifactId, bytes);
  await assert.rejects(h.media.put(u.workspaceId, artifactId, bytes));
  await assert.rejects(h.media.get("../outside"));
  await h.db.query(
    `INSERT INTO newbert.artifacts(id,workspace_id,project_id,version_id,job_id,kind,storage_key,content_hash,input_fingerprint,mime_type,byte_size,validation_status) VALUES($1,$2,$3,$4,$5,'video',$6,$7,$7,'video/mp4',$8,'passed')`,
    [
      artifactId,
      u.workspaceId,
      lease.project_id,
      lease.version_id,
      submitted.json().id,
      object.key,
      object.contentHash,
      bytes.length,
    ],
  );
  const headers = { "X-CSRF-Token": u.csrf, "Idempotency-Key": randomUUID() };
  const r = await h.call(
    "/api/v1/artifacts/" + artifactId + "/access",
    "POST",
    { purpose: "preview" },
    u.cookie,
    headers,
  );
  assert.equal(r.statusCode, 200, r.body);
  assert(!r.body.includes("storage_key"));
  const url = new URL(r.json().url);
  const path = url.pathname + url.search;
  assert.equal(
    (await h.call(path, "GET", undefined, u.cookie)).body,
    bytes.toString(),
  );
  const partial = await h.call(path, "GET", undefined, u.cookie, {
    Range: "bytes=0-6",
  });
  assert.equal(partial.statusCode, 206);
  assert.equal(partial.body, "private");
  assert.equal(
    (await h.call(path, "GET", undefined, other.cookie)).statusCode,
    403,
  );
  url.searchParams.set("expires", "1000000000");
  assert.equal(
    (await h.call(url.pathname + url.search, "GET", undefined, u.cookie))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(
        "/api/v1/artifacts/" + artifactId,
        "GET",
        undefined,
        other.cookie,
      )
    ).statusCode,
    404,
  );
});
test("runtime cannot read platform budgets or auth tables; worker has no identity access or version mutation", async () => {
  await assert.rejects(
    h.runtime.query("SELECT * FROM newbert.platform_budgets"),
    /permission/,
  );
  await assert.rejects(
    h.runtime.query("SELECT * FROM auth.account"),
    /permission/,
  );
  await assert.rejects(
    h.worker.query("SELECT * FROM auth.account"),
    /permission/,
  );
  await assert.rejects(
    h.worker.query("UPDATE newbert.project_versions SET mode=mode"),
    /permission/,
  );
  const a = await h.user(),
    b = await h.user();
  const s = await seed(a);
  const visible = await withWorkspace(
    h.runtime,
    b.workspaceId,
    async (c) =>
      (
        await c.query("SELECT * FROM newbert.projects WHERE id=$1", [
          s.prefix.split("/").at(-1),
        ])
      ).rows,
  );
  assert.equal(visible.length, 0);
});

test("private artifact commit fences stale workers and enforces workspace/global byte limits atomically", async () => {
  const u = await h.user();
  await submit(u);
  const lease = await claimNext(h.worker, "media-budget");
  assert.ok(lease);
  const input = {
    kind: "validation",
    mimeType: "application/json",
    bytes: Buffer.from('{"ok":true}'),
    inputFingerprint: "a".repeat(64),
  };
  const artifactId = await saveArtifact(h.worker, h.media, lease, input);
  assert.ok(artifactId);
  const storage = (await h.call("/api/v1/usage", "GET", undefined, u.cookie))
    .json()
    .resources.find(
      (r: { resource: string }) => r.resource === "storage_bytes",
    );
  assert.equal(storage.used, input.bytes.length);
  await h.db.query(
    "UPDATE newbert.processing_policy SET storage_bytes_limit=$1",
    [input.bytes.length],
  );
  await assert.rejects(
    saveArtifact(h.worker, h.media, lease, input),
    /STORAGE_CAPACITY/,
  );
  await h.db.query(
    "UPDATE newbert.processing_policy SET storage_bytes_limit=10485760,platform_storage_bytes_limit=$1",
    [input.bytes.length],
  );
  await assert.rejects(
    saveArtifact(h.worker, h.media, lease, input),
    /STORAGE_CAPACITY/,
  );
  assert.equal(
    (await h.db.query("SELECT count(*)::int AS n FROM newbert.artifacts"))
      .rows[0].n,
    1,
  );
  await h.db.query(
    "UPDATE newbert.generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
    [lease.id],
  );
  assert.equal(await saveArtifact(h.worker, h.media, lease, input), null);
  assert.equal(
    (await h.db.query("SELECT count(*)::int AS n FROM newbert.artifacts"))
      .rows[0].n,
    1,
  );
});
test("worker crash recovery is bounded before manual attention is required", async () => {
  const u = await h.user();
  const submitted = await submit(u);
  for (let i = 0; i < 3; i++) {
    const lease = await claimNext(h.worker, "crash-" + i);
    assert.ok(lease);
    await h.db.query(
      "UPDATE newbert.generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [lease.id],
    );
    await recoverExpired(h.worker);
  }
  const row = (
    await h.call(
      "/api/v1/jobs/" + submitted.json().id,
      "GET",
      undefined,
      u.cookie,
    )
  ).json();
  assert.equal(row.state, "paused");
  assert.equal(row.pauseReason, "WORKER_RECOVERY_LIMIT");
  assert.equal(await claimNext(h.worker, "no-loop"), null);
});
