import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
import { withWorkspace } from "../../packages/database/src/client.js";
import {
  instagramConfig,
  IG_SCOPES,
  openToken,
  sealToken,
  tokenContext,
} from "../../apps/api/src/modules/instagram/config.js";
import {
  exchangeCode,
  InstagramError,
} from "../../apps/api/src/modules/instagram/provider.js";
let h: Awaited<ReturnType<typeof platform>>,
  calls = 0,
  remote = "17840000000";
let hook: undefined | (() => Promise<void>);
let failure: string | undefined;
const key = randomBytes(32).toString("hex"),
  token = "IGAA_test_private_access_token";
const cfg = () => {
  process.env.INSTAGRAM_APP_ID = "123456789";
  process.env.INSTAGRAM_APP_SECRET = "f13-test-app-secret";
  process.env.INSTAGRAM_TOKEN_KEY = key;
  process.env.INSTAGRAM_API_VERSION = "v25.0";
  delete process.env.INSTAGRAM_REDIRECT_URI;
};
before(
  async () => {
    cfg();
    h = await platform(undefined, {
      exchangeCode: async () => {
        calls++;
        await hook?.();
        if (failure) throw new InstagramError(failure);
        return {
          token,
          expiresAt: new Date(Date.now() + 60 * 86400000),
          remoteAccountId: remote,
          displayName: "newbert_test",
          scopes: IG_SCOPES,
        };
      },
      refreshToken: async () => {
        if (failure) throw new InstagramError(failure);
        return {
          token: token + "_renewed",
          expiresAt: new Date(Date.now() + 60 * 86400000),
        };
      },
    });
  },
  { timeout: 180000 },
);
after(async () => {
  await h?.close();
});
beforeEach(() => {
  cfg();
  calls = 0;
  hook = undefined;
  failure = undefined;
  remote = "1784" + Date.now() + Math.floor(Math.random() * 1000);
});
type User = Awaited<ReturnType<typeof h.user>>;
async function read(u: User) {
  return h.call("/api/v1/instagram/connection", "GET", undefined, u.cookie);
}
async function begin(u: User) {
  const status = await read(u);
  return h.call(
    "/api/v1/instagram/authorization",
    "POST",
    { acknowledgedAccountAccess: true, returnPath: "/app/settings" },
    u.cookie,
    {
      "X-CSRF-Token": u.csrf,
      ...(status.headers.etag
        ? { "If-Match": String(status.headers.etag) }
        : {}),
    },
  );
}
const state = (r: any) =>
  new URL(r.json().authorizationUrl).searchParams.get("state")!;
async function callback(u: User, s: string, extra = "code=test-code") {
  return h.call(
    "/api/v1/instagram/callback?state=" + s + "&" + extra,
    "GET",
    undefined,
    u.cookie,
  );
}
async function connect(u: User) {
  const started = await begin(u);
  assert.equal(started.statusCode, 200, started.body);
  const result = await callback(u, state(started));
  assert.match(String(result.headers.location), /instagram=connected$/);
  return read(u);
}
async function disconnect(u: User) {
  const status = await read(u);
  return h.call("/api/v1/instagram/connection", "DELETE", undefined, u.cookie, {
    "X-CSRF-Token": u.csrf,
    ...(status.headers.etag ? { "If-Match": String(status.headers.etag) } : {}),
  });
}
test("configuration gate, authentication and context-authenticated encryption fail closed", async () => {
  const u = await h.user();
  assert.equal((await h.call("/api/v1/instagram/connection")).statusCode, 401);
  delete process.env.INSTAGRAM_APP_ID;
  const r = await read(u);
  assert.equal(r.json().setup.configured, false);
  assert.equal((await begin(u)).statusCode, 503);
  assert.equal(calls, 0);
  cfg();
  const sealed = sealToken(token, key, "owner:connection");
  assert(!JSON.stringify(sealed).includes(token));
  assert.equal(openToken(sealed, key, "owner:connection"), token);
  assert.throws(() => openToken(sealed, key, "other:connection"));
  assert.throws(() =>
    openToken(sealed, randomBytes(32).toString("hex"), "owner:connection"),
  );
  assert.equal(
    instagramConfig("http://127.0.0.1:3110", {
      ...process.env,
      INSTAGRAM_REDIRECT_URI: "https://attacker.test/callback",
    }).configured,
    false,
  );
});
test("authorization requires CSRF/acknowledgement, has fixed redirect/scopes and binds one-use state to session", async () => {
  const a = await h.user(),
    b = await h.user();
  const missing = await h.call(
    "/api/v1/instagram/authorization",
    "POST",
    { acknowledgedAccountAccess: true, returnPath: "/app/settings" },
    a.cookie,
  );
  assert.equal(missing.statusCode, 403);
  const bad = await h.call(
    "/api/v1/instagram/authorization",
    "POST",
    { acknowledgedAccountAccess: true, returnPath: "https://evil.test" },
    a.cookie,
    { "X-CSRF-Token": a.csrf },
  );
  assert.equal(bad.statusCode, 400);
  const r = await begin(a);
  assert.equal(r.statusCode, 200, r.body);
  const url = new URL(r.json().authorizationUrl);
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.searchParams.get("scope"), IG_SCOPES.join(","));
  assert(!r.body.includes(process.env.INSTAGRAM_APP_SECRET!));
  const s = state(r);
  const denied = await callback(b, s);
  assert.match(String(denied.headers.location), /invalid_state/);
  assert.equal(calls, 0);
  const row = (
    await h.db.query(
      "SELECT * FROM newbert.oauth_states WHERE workspace_id=$1",
      [a.workspaceId],
    )
  ).rows[0];
  assert(!JSON.stringify(row).includes(s));
  assert.equal(row.consumed_at, null);
  assert.match(String((await callback(a, s)).headers.location), /connected$/);
  assert.equal(calls, 1);
  assert.match(
    String((await callback(a, s)).headers.location),
    /invalid_state/,
  );
  assert.equal(calls, 1);
});
test("expired, superseded, cancelled and failed callbacks cannot exchange twice", async () => {
  const u = await h.user();
  const first = await begin(u),
    second = await begin(u);
  assert.match(
    String((await callback(u, state(first))).headers.location),
    /invalid_state/,
  );
  const cancelled = await callback(u, state(second), "error=access_denied");
  assert.match(String(cancelled.headers.location), /cancelled/);
  assert.equal(calls, 0);
  const expired = await begin(u);
  await h.db.query(
    "UPDATE newbert.oauth_states SET expires_at=now()-interval '1 second' WHERE workspace_id=$1",
    [u.workspaceId],
  );
  assert.match(
    String((await callback(u, state(expired))).headers.location),
    /invalid_state/,
  );
  const failed = await begin(u);
  failure = "INSTAGRAM_UNAVAILABLE";
  assert.match(
    String((await callback(u, state(failed))).headers.location),
    /instagram_unavailable/,
  );
  await callback(u, state(failed));
  assert.equal(calls, 1);
  assert.equal((await read(u)).json().connection, null);
});
test("successful connections store only authenticated ciphertext and do not leak cross-workspace tokens", async () => {
  const a = await h.user(),
    b = await h.user();
  const status = await connect(a),
    publicRow = status.json().connection;
  assert(publicRow.id);
  assert.equal(publicRow.status, "active");
  assert(!status.body.includes(token));
  assert(!status.body.includes("secret_ref"));
  assert(!status.body.includes(key));
  const secret = (
    await h.db.query(
      "SELECT * FROM newbert.instagram_secrets WHERE workspace_id=$1",
      [a.workspaceId],
    )
  ).rows[0];
  assert(!JSON.stringify(secret).includes(token));
  assert.equal(
    openToken(
      secret.envelope,
      key,
      tokenContext(a.workspaceId, publicRow.id, secret.id),
    ),
    token,
  );
  assert.equal((await read(b)).json().connection, null);
  assert.equal(
    (
      await withWorkspace(h.runtime, b.workspaceId, (c) =>
        c.query("SELECT * FROM newbert.instagram_secrets"),
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await h.db.query(
        "SELECT has_table_privilege('test_worker','newbert.instagram_secrets','SELECT') AS allowed",
      )
    ).rows[0].allowed,
    false,
  );
});
test("disconnect invalidates an in-flight callback even before any account was connected", async () => {
  const u = await h.user(),
    started = await begin(u);
  hook = async () => {
    const r = await disconnect(u);
    assert.equal(r.statusCode, 204, r.body);
  };
  assert.match(
    String((await callback(u, state(started))).headers.location),
    /connection_changed/,
  );
  assert.equal((await read(u)).json().connection, null);
  assert.equal(
    (
      await h.db.query(
        "SELECT * FROM newbert.instagram_secrets WHERE workspace_id=$1",
        [u.workspaceId],
      )
    ).rowCount,
    0,
  );
});
test("reconnect rotates grant identity, disconnect requires current revision and removes stored token", async () => {
  const u = await h.user(),
    original = await connect(u);
  const id = original.json().connection.id;
  await withWorkspace(h.runtime, u.workspaceId, (c) =>
    c.query("SELECT newbert.pause_instagram_deliveries($1,$2)", [
      id,
      "connection_changed",
    ]),
  );
  const started = await begin(u);
  assert.equal((await read(u)).json().connection.status, "reauth_required");
  assert.match(
    String((await callback(u, state(started))).headers.location),
    /connected/,
  );
  const updated = await read(u);
  assert.notEqual(updated.json().connection.id, id);
  const stale = await h.call(
    "/api/v1/instagram/connection",
    "DELETE",
    undefined,
    u.cookie,
    { "X-CSRF-Token": u.csrf, "If-Match": String(original.headers.etag) },
  );
  assert.equal(stale.statusCode, 412);
  assert.equal((await disconnect(u)).statusCode, 204);
  assert.equal((await read(u)).json().connection, null);
  assert.equal(
    (
      await h.db.query(
        "SELECT * FROM newbert.instagram_secrets WHERE workspace_id=$1",
        [u.workspaceId],
      )
    ).rowCount,
    0,
  );
  assert.equal((await disconnect(u)).statusCode, 204);
});
test("same remote account cannot silently attach to another workspace", async () => {
  const a = await h.user(),
    b = await h.user();
  await connect(a);
  const r = await begin(b);
  assert.match(
    String((await callback(b, state(r))).headers.location),
    /account_unavailable/,
  );
  assert.equal((await read(b)).json().connection, null);
  assert.equal((await read(a)).json().connection.status, "active");
});
test("renewal retains connection identity and rejected/expired access requires reauthorization", async () => {
  const u = await h.user();
  let row = await connect(u);
  const id = row.json().connection.id;
  const refresh = () =>
    h.call("/api/v1/instagram/connection/refresh", "POST", {}, u.cookie, {
      "X-CSRF-Token": u.csrf,
      "If-Match": String(row.headers.etag),
    });
  assert.equal((await refresh()).statusCode, 409);
  await h.db.query(
    "UPDATE newbert.instagram_connections SET created_at=now()-interval '2 days' WHERE id=$1",
    [id],
  );
  const renewed = await refresh();
  assert.equal(renewed.statusCode, 200, renewed.body);
  assert.equal(renewed.json().connection.id, id);
  assert.equal(renewed.json().connection.revision, 2);
  row = await read(u);
  await h.db.query(
    "UPDATE newbert.instagram_connections SET refreshed_at=now()-interval '2 days' WHERE id=$1",
    [id],
  );
  failure = "INSTAGRAM_REAUTH_REQUIRED";
  assert.equal((await refresh()).statusCode, 409);
  assert.equal((await read(u)).json().connection.status, "reauth_required");
  const other = await h.user();
  failure = undefined;
  remote += "9";
  const status = await connect(other);
  await h.db.query(
    "UPDATE newbert.instagram_connections SET expires_at=now()-interval '1 second' WHERE id=$1",
    [status.json().connection.id],
  );
  assert.equal((await read(other)).json().connection.status, "reauth_required");
});
test("provider adapter uses bounded official endpoints and requires actual granted permissions and professional profile", async () => {
  const config = instagramConfig(h.origin),
    urls: string[] = [];
  const responses = [
    {
      access_token: "short-private-token",
      user_id: "123456",
      permissions: IG_SCOPES,
    },
    { access_token: token, expires_in: 5184000 },
    {
      user_id: "17840000",
      username: "testcreator",
      account_type: "MEDIA_CREATOR",
    },
  ];
  const fetcher = (async (url: any, init: any) => {
    urls.push(String(url));
    assert.equal(init.redirect, "error");
    assert(init.signal);
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  }) as typeof fetch;
  const grant = await exchangeCode(config, "one-code", fetcher);
  assert.equal(grant.displayName, "testcreator");
  assert(urls[0]!.startsWith("https://api.instagram.com/oauth/access_token"));
  assert(urls[1]!.startsWith("https://graph.instagram.com/access_token?"));
  assert(urls[2]!.startsWith("https://graph.instagram.com/v25.0/123456?"));
  let requests = 0;
  await assert.rejects(
    exchangeCode(config, "code", (async () => {
      requests++;
      return new Response(
        JSON.stringify({
          access_token: "short-private-token",
          user_id: "123456",
          permissions: ["instagram_business_basic"],
        }),
      );
    }) as typeof fetch),
    /INSTAGRAM_PERMISSIONS_REQUIRED/,
  );
  assert.equal(requests, 1);
});
test("another session of the same user cannot consume an OAuth state", async () => {
  const u = await h.user();
  const r = await begin(u);
  const login = await h.call("/api/auth/sign-in/email", "POST", {
    email: u.email,
    password: u.password,
  });
  const sc = login.headers["set-cookie"];
  const cookie = (Array.isArray(sc) ? sc : [sc || ""])
    .map((x) => x.split(";")[0])
    .join("; ");
  const rejected = await h.call(
    "/api/v1/instagram/callback?state=" + state(r) + "&code=test",
    "GET",
    undefined,
    cookie,
  );
  assert.match(String(rejected.headers.location), /invalid_state/);
  assert.equal(calls, 0);
  assert.match(
    String((await callback(u, state(r))).headers.location),
    /connected/,
  );
});
test("connection changes pause pending schedules and preserve uncertain in-flight publishing for reconciliation", async () => {
  const u = await h.user();
  const connected = await connect(u),
    cid = connected.json().connection.id;
  const headers = { "X-CSRF-Token": u.csrf, "Idempotency-Key": randomUUID() };
  const created = await h.call(
    "/api/v1/projects",
    "POST",
    { title: "Pending delivery fixture", brief },
    u.cookie,
    headers,
  );
  const pid = created.json().id;
  const d = await h.call(
    "/api/v1/projects/" + pid + "/draft",
    "GET",
    undefined,
    u.cookie,
  );
  const job = await h.call(
    "/api/v1/projects/" + pid + "/jobs",
    "POST",
    { kind: "plan", acknowledgedUsageTerms: true },
    u.cookie,
    {
      ...headers,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(d.headers.etag),
    },
  );
  assert.equal(job.statusCode, 202, job.body);
  const actor = (
    await h.db.query("SELECT user_id FROM newbert.workspaces WHERE id=$1", [
      u.workspaceId,
    ])
  ).rows[0].user_id;
  const intents = [randomUUID(), randomUUID()];
  for (let i = 0; i < 2; i++)
    await h.db.query(
      "INSERT INTO newbert.publish_intents(id,workspace_id,project_id,version_id,connection_id,connection_revision,production_job_id,caption,payload_hash,authorized_by,authorized_at,state,late_policy) VALUES($1,$2,$3,$4,$5,1,$6,'test',$7,$8,now(),$9,'bounded_window')",
      [
        intents[i],
        u.workspaceId,
        pid,
        job.json().versionId,
        cid,
        job.json().id,
        "a".repeat(64),
        actor,
        i === 0 ? "scheduled" : "publishing",
      ],
    );
  await h.db.query(
    "INSERT INTO newbert.publication_schedules(id,workspace_id,intent_id,scheduled_at,timezone,state) VALUES($1,$2,$3,now()+interval '1 hour','Asia/Kolkata','scheduled')",
    [randomUUID(), u.workspaceId, intents[0]],
  );
  const reconnect = await begin(u);
  assert.equal(reconnect.statusCode, 200, reconnect.body);
  const rows = (
    await h.db.query(
      "SELECT id,state,pause_reason FROM newbert.publish_intents WHERE workspace_id=$1",
      [u.workspaceId],
    )
  ).rows;
  assert.equal(rows.find((x) => x.id === intents[0]).state, "paused");
  assert.equal(
    rows.find((x) => x.id === intents[1]).state,
    "reconciliation_required",
  );
  assert.equal(
    (
      await h.db.query(
        "SELECT state FROM newbert.publication_schedules WHERE workspace_id=$1",
        [u.workspaceId],
      )
    ).rows[0].state,
    "paused",
  );
  await callback(u, state(reconnect));
  assert.equal(
    (
      await h.db.query(
        "SELECT state FROM newbert.publication_schedules WHERE workspace_id=$1",
        [u.workspaceId],
      )
    ).rows[0].state,
    "paused",
  );
});
