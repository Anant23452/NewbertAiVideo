import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
let h: Awaited<ReturnType<typeof platform>>,
  a: Awaited<ReturnType<Awaited<ReturnType<typeof platform>>["user"]>>,
  b: typeof a;
before(
  async () => {
    h = await platform();
    a = await h.user();
    b = await h.user();
  },
  { timeout: 180000 },
);
after(async () => {
  await h?.close();
});
const write = (
  path: string,
  body: unknown,
  etag?: string,
  key = randomUUID(),
  user = a,
  method = "POST",
) =>
  h.call(path, method, body, user.cookie, {
    "X-CSRF-Token": user.csrf,
    "Idempotency-Key": key,
    ...(etag ? { "If-Match": etag } : {}),
  });
async function create(title = "A psychology explanation") {
  const r = await write("/api/v1/projects", { title, brief });
  assert.equal(r.statusCode, 201, r.body);
  return r;
}
test("creates a private project/draft atomically; duplicate command replays and different payload conflicts", async () => {
  const key = randomUUID(),
    body = { title: "My first explanation", brief };
  const [one, two] = await Promise.all([
    write("/api/v1/projects", body, undefined, key),
    write("/api/v1/projects", body, undefined, key),
  ]);
  assert.equal(one.statusCode, 201, one.body);
  assert.equal(two.statusCode, 201, two.body);
  assert.equal(one.json().id, two.json().id);
  assert.ok(
    one.headers["idempotency-replayed"] || two.headers["idempotency-replayed"],
  );
  assert.equal(
    (
      await write(
        "/api/v1/projects",
        { ...body, title: "Changed" },
        undefined,
        key,
      )
    ).statusCode,
    409,
  );
  const d = await h.call(
    "/api/v1/projects/" + one.json().id + "/draft",
    "GET",
    undefined,
    a.cookie,
  );
  assert.equal(d.statusCode, 200);
  assert.deepEqual(d.json().content.brief, brief);
});
test("denies cross-account reads/mutations and missing/foreign CSRF", async () => {
  const p = await create();
  const path = "/api/v1/projects/" + p.json().id;
  for (const suffix of ["", "/draft", "/versions"])
    assert.equal(
      (await h.call(path + suffix, "GET", undefined, b.cookie)).statusCode,
      404,
    );
  assert.equal(
    (
      await write(
        path,
        { title: "Stolen" },
        String(p.headers.etag),
        randomUUID(),
        b,
        "PATCH",
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await h.call(path, "PATCH", { title: "Missing CSRF" }, a.cookie, {
        "if-match": String(p.headers.etag),
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await h.call(path, "PATCH", { title: "Wrong CSRF" }, a.cookie, {
        "if-match": String(p.headers.etag),
        "x-csrf-token": b.csrf,
      })
    ).statusCode,
    403,
  );
  assert.equal((await h.call("/api/v1/projects")).statusCode, 401);
});
test("strict input rejects unknown fields, invalid briefs and arbitrary scene code", async () => {
  assert.equal(
    (
      await write("/api/v1/projects", {
        title: "Bad",
        brief: { ...brief, language: "Unknown" },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await write("/api/v1/projects", {
        title: "Bad",
        brief,
        workspaceId: b.workspaceId,
      })
    ).statusCode,
    400,
  );
  const p = await create();
  const path = "/api/v1/projects/" + p.json().id + "/draft";
  const d = await h.call(path, "GET", undefined, a.cookie);
  assert.equal(
    (
      await write(
        path,
        { content: { ...d.json().content, code: "process.exit()" } },
        String(d.headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    400,
  );
});
test("draft optimistic concurrency preserves the winner and requires If-Match", async () => {
  const p = await create(),
    path = "/api/v1/projects/" + p.json().id + "/draft";
  const d = await h.call(path, "GET", undefined, a.cookie);
  const content = {
    ...d.json().content,
    brief: { ...brief, topic: "A newly edited explanation about psychology" },
  };
  assert.equal(
    (await write(path, { content }, undefined, randomUUID(), a, "PATCH"))
      .statusCode,
    428,
  );
  const [one, two] = await Promise.all([
    write(path, { content }, String(d.headers.etag), randomUUID(), a, "PATCH"),
    write(path, { content }, String(d.headers.etag), randomUUID(), a, "PATCH"),
  ]);
  assert.deepEqual([one.statusCode, two.statusCode].sort(), [200, 412]);
  assert.equal(
    (await h.call(path, "GET", undefined, a.cookie)).json().revision,
    2,
  );
});
test("archive and restore use revisions; archived drafts reject edits", async () => {
  const p = await create(),
    path = "/api/v1/projects/" + p.json().id;
  const archived = await write(
    path,
    { status: "archived" },
    String(p.headers.etag),
    randomUUID(),
    a,
    "PATCH",
  );
  assert.equal(archived.statusCode, 200, archived.body);
  const d = await h.call(path + "/draft", "GET", undefined, a.cookie);
  assert.equal(
    (
      await write(
        path + "/draft",
        { content: d.json().content },
        String(d.headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await write(
        path,
        { status: "active" },
        String(p.headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    412,
  );
  assert.equal(
    (
      await write(
        path,
        { status: "active" },
        String(archived.headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    200,
  );
});
test("paginated library has stable distinct rows and rejects malformed cursors", async () => {
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const r = await h.call(
      "/api/v1/projects?limit=2" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      "GET",
      undefined,
      a.cookie,
    );
    assert.equal(r.statusCode, 200, r.body);
    for (const p of r.json().items) {
      assert(!seen.has(p.id));
      seen.add(p.id);
    }
    cursor = r.json().nextCursor;
  } while (cursor);
  assert.ok(seen.size >= 5);
  assert.equal(
    (
      await h.call(
        "/api/v1/projects?cursor=invalid",
        "GET",
        undefined,
        a.cookie,
      )
    ).statusCode,
    400,
  );
});
test("submission freezes an immutable version; later draft changes do not mutate it", async () => {
  const p = await create(),
    prefix = "/api/v1/projects/" + p.json().id;
  const d = await h.call(prefix + "/draft", "GET", undefined, a.cookie);
  const submitted = await write(
    prefix + "/jobs",
    { kind: "plan", acknowledgedUsageTerms: true },
    String(d.headers.etag),
  );
  assert.equal(submitted.statusCode, 202, submitted.body);
  const versionId = submitted.json().versionId;
  const changed = {
    ...d.json().content,
    brief: {
      ...brief,
      topic: "An entirely different topic in the editable draft",
    },
  };
  assert.equal(
    (
      await write(
        prefix + "/draft",
        { content: changed },
        String(d.headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    200,
  );
  const v = await h.call(
    "/api/v1/versions/" + versionId,
    "GET",
    undefined,
    a.cookie,
  );
  assert.equal(v.json().content.brief.topic, brief.topic);
  assert.equal(
    (await h.call("/api/v1/versions/" + versionId, "GET", undefined, b.cookie))
      .statusCode,
    404,
  );
  await assert.rejects(
    h.db.query(
      "UPDATE newbert.project_versions SET input_hash=$2 WHERE id=$1",
      [versionId, "0".repeat(64)],
    ),
    /immutable/,
  );
  assert.equal(
    (
      await write(
        prefix,
        { status: "archived" },
        String((await h.call(prefix, "GET", undefined, a.cookie)).headers.etag),
        randomUUID(),
        a,
        "PATCH",
      )
    ).statusCode,
    409,
  );
});
