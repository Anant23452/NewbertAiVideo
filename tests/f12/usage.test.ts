import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
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
test("generation settings require login, disclose no secrets and make no provider requests", async () => {
  assert.equal((await h.call("/api/v1/generation-settings")).statusCode, 401);
  const user = await h.user();
  const original = globalThis.fetch;
  let external = 0;
  globalThis.fetch = async () => {
    external++;
    throw Error("no network");
  };
  process.env.ELEVENLABS_API_KEY = "f12-secret-marker";
  process.env.ELEVENLABS_VOICE_ID = "f12-private-voice";
  process.env.GEMINI_API_KEY = "f12-script-secret";
  try {
    const r = await h.call(
      "/api/v1/generation-settings",
      "GET",
      undefined,
      user.cookie,
    );
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().speech.configured, true);
    assert.equal(r.json().voiceRecordingRequired, false);
    assert.equal(r.json().personalKeysEnabled, false);
    assert.equal(r.json().voiceMode, "platform_generated");
    assert(!r.body.includes("f12-"));
    assert.equal(external, 0);
    process.env.SPEECH_ENABLED = "false";
    assert.equal(
      (
        await h.call(
          "/api/v1/generation-settings",
          "GET",
          undefined,
          user.cookie,
        )
      ).json().speech.enabled,
      false,
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.SPEECH_ENABLED;
  }
});
test("used, reserved and remaining amounts obey tenant isolation and the current lower policy ceiling", async () => {
  const a = await h.user(),
    b = await h.user();
  await h.db.query(
    "INSERT INTO newbert.usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units,used_units,reserved_units) VALUES($1,$2,'provider_credits',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day',2000,300,500)",
    [randomUUID(), a.workspaceId],
  );
  const r = await h.call("/api/v1/usage", "GET", undefined, a.cookie);
  assert.equal(r.statusCode, 200);
  const resource = r
    .json()
    .resources.find((x: any) => x.resource === "provider_credits");
  assert.deepEqual(
    [resource.used, resource.reserved, resource.remaining, resource.limit],
    [300, 500, 1200, 2000],
  );
  const other = (await h.call("/api/v1/usage", "GET", undefined, b.cookie))
    .json()
    .resources.find((x: any) => x.resource === "provider_credits");
  assert.equal(other.used, 0);
  assert.equal(other.reserved, 0);
  await h.db.query(
    "UPDATE newbert.production_limits SET workspace_characters=500",
  );
  const lower = (await h.call("/api/v1/usage", "GET", undefined, a.cookie))
    .json()
    .resources.find((x: any) => x.resource === "provider_credits");
  assert.equal(lower.limit, 500);
  assert.equal(lower.remaining, 0);
  assert.equal(lower.used, 300);
  assert.equal(lower.reserved, 500);
  await h.db.query(
    "UPDATE newbert.production_limits SET workspace_characters=2000",
  );
  const storage = r
    .json()
    .resources.find((x: any) => x.resource === "storage_bytes");
  assert.equal(storage.resetsAt, null);
  assert.equal(r.json().allowanceTimezone, "UTC");
  for (const row of r.json().resources.filter((x: any) => x.resetsAt)) {
    assert.equal(new Date(row.resetsAt).getUTCHours(), 0);
    assert.equal(new Date(row.resetsAt).getUTCMinutes(), 0);
  }
});
test("waiting request cancellation releases reserved allowance and settings pause flags are accurate", async () => {
  const a = await h.user();
  const headers = { "X-CSRF-Token": a.csrf, "Idempotency-Key": randomUUID() };
  const created = await h.call(
    "/api/v1/projects",
    "POST",
    { title: "F12 allowance", brief },
    a.cookie,
    headers,
  );
  const id = created.json().id;
  const draft = await h.call(
    "/api/v1/projects/" + id + "/draft",
    "GET",
    undefined,
    a.cookie,
  );
  const queued = await h.call(
    "/api/v1/projects/" + id + "/jobs",
    "POST",
    { kind: "plan", acknowledgedUsageTerms: true },
    a.cookie,
    {
      ...headers,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(draft.headers.etag),
    },
  );
  assert.equal(queued.statusCode, 202, queued.body);
  const used = (await h.call("/api/v1/usage", "GET", undefined, a.cookie))
    .json()
    .resources.find((x: any) => x.resource === "generation_count");
  assert.equal(used.reserved, 1);
  assert.equal(used.used, 0);
  const cancel = await h.call(
    "/api/v1/jobs/" + queued.json().id + "/cancel",
    "POST",
    {},
    a.cookie,
    {
      ...headers,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(queued.headers.etag),
    },
  );
  assert.equal(cancel.statusCode, 202, cancel.body);
  const released = (await h.call("/api/v1/usage", "GET", undefined, a.cookie))
    .json()
    .resources.find((x: any) => x.resource === "generation_count");
  assert.equal(released.reserved, 0);
  assert.equal(released.remaining, used.remaining + 1);
  await h.db.query(
    "UPDATE newbert.processing_policy SET production_enabled=false,processing_enabled=false",
  );
  const settings = (
    await h.call("/api/v1/generation-settings", "GET", undefined, a.cookie)
  ).json();
  assert.equal(settings.processingEnabled, false);
  assert.equal(settings.speech.enabled, false);
  await h.db.query(
    "UPDATE newbert.processing_policy SET production_enabled=true,processing_enabled=true",
  );
});
test("speech request counts include uncertain submitted calls and exclude yesterday and other workspaces", async () => {
  const a = await h.user();
  const p = await h.call(
    "/api/v1/projects",
    "POST",
    { title: "F12 voice request", brief },
    a.cookie,
    { "X-CSRF-Token": a.csrf, "Idempotency-Key": randomUUID() },
  );
  const d = await h.call(
    "/api/v1/projects/" + p.json().id + "/draft",
    "GET",
    undefined,
    a.cookie,
  );
  const j = await h.call(
    "/api/v1/projects/" + p.json().id + "/jobs",
    "POST",
    { kind: "plan", acknowledgedUsageTerms: true },
    a.cookie,
    {
      "X-CSRF-Token": a.csrf,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(d.headers.etag),
    },
  );
  assert.equal(j.statusCode, 202, j.body);
  for (const [i, day] of [
    [1, 0],
    [2, 1],
  ]) {
    const attempt = randomUUID();
    await h.db.query(
      "INSERT INTO newbert.job_attempts(id,workspace_id,job_id,stage,attempt_number,state,request_fingerprint,lease_token) VALUES($1,$2,$3,'generating_voice',$4,'unknown',$5,1)",
      [attempt, a.workspaceId, j.json().id, i, "a".repeat(64)],
    );
    await h.db.query(
      "INSERT INTO newbert.speech_calls(id,workspace_id,job_id,attempt_id,characters,created_at) VALUES($1,$2,$3,$4,20,now()-make_interval(days=>$5))",
      [randomUUID(), a.workspaceId, j.json().id, attempt, day],
    );
  }
  const r = (await h.call("/api/v1/usage", "GET", undefined, a.cookie))
    .json()
    .resources.find((x: any) => x.resource === "speech_requests");
  assert.deepEqual([r.limit, r.used, r.reserved, r.remaining], [2, 1, 0, 1]);
  const stranger = await h.user();
  const other = (
    await h.call("/api/v1/usage", "GET", undefined, stranger.cookie)
  )
    .json()
    .resources.find((x: any) => x.resource === "speech_requests");
  assert.equal(other.used, 0);
});
