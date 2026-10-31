import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import pg from "pg";
import { migrate, migrationDirectory } from "../../scripts/db/migrations.mjs";
import { resolve } from "node:path";
import { platform, brief } from "../support/platform.js";
import { hash } from "../../apps/api/src/modules/projects/core.js";
import {
  speechManifest,
  align,
  ProductionError,
} from "../../apps/api/src/modules/production/timing.js";
import {
  speechConfig,
  eligibility,
  synthesize,
} from "../../apps/api/src/modules/production/provider.js";
import { runProduction } from "../../apps/api/src/modules/production/runner.js";
import { claimNext } from "../../apps/api/src/modules/processing/queue.js";
import {
  run,
  measureAudio,
  renderVideo,
} from "../../apps/api/src/modules/production/render.js";
import {
  sceneOps,
  frameSvg,
} from "../../packages/contracts/src/composition.js";
let h: Awaited<ReturnType<typeof platform>>, audio: Buffer;
const results: string[] = [];
before(
  async () => {
    process.env.ELEVENLABS_API_KEY = "test-only";
    process.env.ELEVENLABS_VOICE_ID = "testvoice";
    process.env.ELEVENLABS_MODEL = "eleven_multilingual_v2";
    h = await platform();
    const dir = resolve("test-results/f9-audio", randomUUID());
    await mkdir(dir, { recursive: true });
    await run(
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:a",
        "libmp3lame",
        "audio.mp3",
      ],
      dir,
    );
    audio = await readFile(dir + "/audio.mp3");
  },
  { timeout: 180000 },
);
after(async () => {
  await h?.close();
});
beforeEach(async () => {
  await h.db.query(
    "TRUNCATE newbert.projects,newbert.usage_buckets,newbert.platform_budgets,newbert.outbox_events,newbert.idempotency_records CASCADE",
  );
  await h.db.query(
    "UPDATE newbert.workspace_dispatch SET active_count=0,last_claimed_at=NULL",
  );
  await h.db.query(
    "UPDATE newbert.production_limits SET max_duration_ms=120000,max_characters=1600,workspace_characters=2000,global_characters=4000",
  );
});
function content() {
  return {
    schemaVersion: 1,
    brief,
    voice: { catalogVoiceId: "testvoice", providerConnectionId: null },
    style: { preset: "black_glow", accentColor: "#A18BFF" },
    scenes: [
      {
        id: randomUUID(),
        purpose: "Explain a basic concept",
        component: "diagram",
        title: "एक आसान विचार",
        displayNarration: "एक आसान विचार समझें।",
        spokenNarration: "एक आसान विचार समझें।",
        textMappings: [],
        objects: ["Idea", "Meaning"].map((label) => ({
          id: randomUUID(),
          type: "node",
          label,
          parameters: { shape: "circle" },
        })),
        cues: [],
        claimIds: [],
      },
    ],
    pronunciationOverrides: [],
    captionOverrides: [],
  };
}
async function seed(existingUser?: Awaited<ReturnType<typeof h.user>>) {
  const u = existingUser ?? (await h.user());
  const created = await h.call(
    "/api/v1/projects",
    "POST",
    {
      title: "Production test",
      brief,
      voice: { catalogVoiceId: "testvoice", providerConnectionId: null },
    },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "Idempotency-Key": randomUUID() },
  );
  const projectId = created.json().id;
  const c = content();
  const d = await h.call(
    "/api/v1/projects/" + projectId + "/draft",
    "GET",
    undefined,
    u.cookie,
  );
  const saved = await h.call(
    "/api/v1/projects/" + projectId + "/draft",
    "PATCH",
    { content: c },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "If-Match": String(d.headers.etag) },
  );
  assert.equal(saved.statusCode, 200, saved.body);
  const owner = (
    await h.db.query("SELECT user_id FROM newbert.workspaces WHERE id=$1", [
      u.workspaceId,
    ])
  ).rows[0].user_id;
  const versionId = randomUUID();
  await h.db.query(
    `INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode,approval_actor_id,approved_at) VALUES($1,$2,$3,1,2,1,$4,$5,'guided',$6,now())`,
    [versionId, u.workspaceId, projectId, JSON.stringify(c), hash(c), owner],
  );
  await h.db.query(
    "INSERT INTO newbert.storyboard_approvals(id,workspace_id,project_id,draft_revision,content_hash,actor_id,reviewed_claim_ids,version_id) VALUES($1,$2,$3,2,$4,$5,ARRAY[]::uuid[],$6)",
    [randomUUID(), u.workspaceId, projectId, hash(c), owner, versionId],
  );
  await h.db.query(
    "UPDATE newbert.projects SET next_version_number=2 WHERE id=$1",
    [projectId],
  );
  return {
    u,
    projectId,
    versionId,
    content: c,
    etag: String(saved.headers.etag),
  };
}
async function submit(s: Awaited<ReturnType<typeof seed>>, key = randomUUID()) {
  return h.call(
    "/api/v1/projects/" + s.projectId + "/jobs",
    "POST",
    {
      kind: "produce",
      scriptApproved: true,
      acknowledgedUsageTerms: true,
      acknowledgedVoiceTerms: true,
    },
    s.u.cookie,
    { "X-CSRF-Token": s.u.csrf, "If-Match": s.etag, "Idempotency-Key": key },
  );
}
function response(text: string) {
  const chars = [...text];
  return {
    audio_base64: audio.toString("base64"),
    alignment: {
      characters: chars,
      character_start_times_seconds: chars.map(
        (_, i) => (i / chars.length) * 2.9,
      ),
      character_end_times_seconds: chars.map(
        (_, i) => ((i + 1) / chars.length) * 2.9,
      ),
    },
    requestId: "test-request",
  };
}
const entitled = async () => ({
  voiceId: "testvoice",
  voiceName: "Test",
  model: "eleven_multilingual_v2",
  tier: "free",
  commercialUse: "not_permitted",
  attributionRequired: true,
  termsUrl: "https://elevenlabs.io/terms-of-use",
});

async function produce(s: Awaited<ReturnType<typeof seed>>) {
  const request = await submit(s);
  assert.equal(request.statusCode, 202, request.body);
  const lease = await claimNext(h.worker, randomUUID());
  assert(lease);
  await runProduction(h.worker, lease, h.media, {
    eligibility: entitled,
    synthesize: async (text) => response(text),
    measureAudio,
    renderVideo,
  });
  const status = await h.call(
    "/api/v1/projects/" + s.projectId + "/production",
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(status.json().ready, true, status.body);
  return status.json();
}
test("output history identifies exact successful version and offers session-bound MP4/VTT downloads", async () => {
  const s = await seed(),
    production = await produce(s);
  const history = await h.call(
    "/api/v1/projects/" + s.projectId + "/outputs",
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(history.statusCode, 200, history.body);
  const out = history.json().items[0];
  assert.equal(out.versionId, s.versionId);
  assert.equal(out.versionNumber, 1);
  assert.equal(out.latestGood, true);
  assert(out.captionsId);
  for (const [id, ext] of [
    [out.id, "mp4"],
    [out.captionsId, "vtt"],
  ]) {
    const link = await h.call(
      "/api/v1/artifacts/" + id + "/access",
      "POST",
      { purpose: "download" },
      s.u.cookie,
      { "X-CSRF-Token": s.u.csrf, "Idempotency-Key": randomUUID() },
    );
    assert.equal(link.statusCode, 200, link.body);
    const url = new URL(link.json().url);
    const data = await h.call(
      url.pathname + url.search,
      "GET",
      undefined,
      s.u.cookie,
    );
    assert.equal(data.statusCode, 200, data.body.slice(0, 100));
    assert.match(
      String(data.headers["content-disposition"]),
      new RegExp("attachment;.*\\." + ext + '"'),
    );
    if (ext === "vtt") assert(data.body.startsWith("WEBVTT"));
    const stranger = await h.user();
    assert.equal(
      (
        await h.call(
          url.pathname + url.search,
          "GET",
          undefined,
          stranger.cookie,
        )
      ).statusCode,
      403,
    );
  }
  const outsider = await h.user();
  assert.equal(
    (
      await h.call(
        "/api/v1/projects/" + s.projectId + "/outputs",
        "GET",
        undefined,
        outsider.cookie,
      )
    ).statusCode,
    404,
  );
  assert.equal(production.job.versionId, s.versionId);
});
test("restore is conflict-aware, idempotent, private and preserves immutable snapshot and last good output", async () => {
  const s = await seed();
  await produce(s);
  const original = await h.db.query(
    "SELECT input_hash FROM newbert.project_versions WHERE id=$1",
    [s.versionId],
  );
  const headers = {
      "X-CSRF-Token": s.u.csrf,
      "If-Match": s.etag,
      "Idempotency-Key": randomUUID(),
    },
    body = { acknowledgedDraftReplacement: true };
  const url = "/api/v1/versions/" + s.versionId + "/restore";
  const restored = await h.call(url, "POST", body, s.u.cookie, headers);
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json().revision, 3);
  const replay = await h.call(url, "POST", body, s.u.cookie, headers);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().revision, 3);
  const stale = await h.call(url, "POST", body, s.u.cookie, {
    ...headers,
    "Idempotency-Key": randomUUID(),
  });
  assert.equal(stale.statusCode, 412, stale.body);
  const other = await h.user();
  const denied = await h.call(url, "POST", body, other.cookie, {
    ...headers,
    "X-CSRF-Token": other.csrf,
    "Idempotency-Key": randomUUID(),
  });
  assert.equal(denied.statusCode, 404);
  const rejected = await h.call(url, "POST", {}, s.u.cookie, {
    ...headers,
    "Idempotency-Key": randomUUID(),
  });
  assert.equal(rejected.statusCode, 400);
  const approval = await submit({ ...s, etag: String(restored.headers.etag) });
  assert.equal(approval.statusCode, 409);
  assert.equal(approval.json().code, "APPROVAL_REQUIRED");
  assert.equal(
    (
      await h.db.query(
        "SELECT input_hash FROM newbert.project_versions WHERE id=$1",
        [s.versionId],
      )
    ).rows[0].input_hash,
    original.rows[0].input_hash,
  );
  const history = await h.call(
    "/api/v1/projects/" + s.projectId + "/outputs",
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(history.json().items[0].latestGood, true);
});
test("caption presentation retains exact speech fingerprint and timing; semantic edits and invalid anchors are rejected", () => {
  const c = content(),
    m = speechManifest(c, speechConfig()),
    base = align(m, response(m.text).alignment, 3.03);
  const edited = structuredClone(c);
  edited.captionOverrides = [
    {
      sceneId: c.scenes[0]!.id,
      spokenSpan: { start: 0, end: [...c.scenes[0]!.spokenNarration].length },
      displayText: "एक आसान विचार समझें!",
    },
  ] as never;
  const revised = speechManifest(edited, speechConfig()),
    timed = align(revised, response(m.text).alignment, 3.03);
  assert.equal(revised.fingerprint, m.fingerprint);
  assert.equal(
    timed.timeline[0].captions[0].start,
    base.timeline[0].captions[0].start,
  );
  assert.equal(
    timed.timeline[0].captions[0].end,
    base.timeline[0].captions[0].end,
  );
  assert(timed.timeline[0].captions[0].text.endsWith("!"));
  (edited.captionOverrides[0] as any).displayText = "एक गलत विचार समझें!";
  assert.throws(
    () => speechManifest(edited, speechConfig()),
    /CAPTION_MEANING_CHANGED/,
  );
  (edited.captionOverrides[0] as any).spokenSpan.end = 1;
  assert.throws(
    () => speechManifest(edited, speechConfig()),
    /INVALID_CAPTION_OVERRIDE/,
  );
  for (const [original, corrected] of [
    ["Value 3.14 stays.", "Value 314 stays."],
    ["Value १.५ stays.", "Value १५ stays."],
    ["We're here today.", "Were here today."],
  ]) {
    const unsafe = content();
    const scene = unsafe.scenes[0]!;
    scene.spokenNarration = scene.displayNarration = original;
    unsafe.captionOverrides = [{
      sceneId: scene.id,
      spokenSpan: {start:0,end:[...original].length},
      displayText: corrected,
    }] as never;
    assert.throws(() => speechManifest(unsafe,speechConfig()), /CAPTION_MEANING_CHANGED/);
  }
});
test("visual/caption revision reuses validated narration and a failed replacement retains the previous ready video", async () => {
  const s = await seed();
  await produce(s);
  const before = (
    await h.call(
      "/api/v1/projects/" + s.projectId + "/outputs",
      "GET",
      undefined,
      s.u.cookie,
    )
  ).json().items[0];
  const changed = structuredClone(s.content);
  changed.scenes[0]!.title = "A different visual";
  changed.style.accentColor = "#12AA88";
  changed.captionOverrides = [
    {
      sceneId: changed.scenes[0]!.id,
      spokenSpan: {
        start: 0,
        end: [...changed.scenes[0]!.spokenNarration].length,
      },
      displayText: "एक आसान विचार समझें!",
    },
  ] as never;
  const owner = (
    await h.db.query("SELECT user_id FROM newbert.workspaces WHERE id=$1", [
      s.u.workspaceId,
    ])
  ).rows[0].user_id;
  const version = randomUUID();
  await h.db.query(
    "INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode,approval_actor_id,approved_at) VALUES($1,$2,$3,2,3,1,$4,$5,'guided',$6,now())",
    [
      version,
      s.u.workspaceId,
      s.projectId,
      JSON.stringify(changed),
      hash(changed),
      owner,
    ],
  );
  await h.db.query(
    "UPDATE newbert.project_drafts SET content=$2,revision=3 WHERE project_id=$1",
    [s.projectId, JSON.stringify(changed)],
  );
  await h.db.query(
    "INSERT INTO newbert.storyboard_approvals(id,workspace_id,project_id,draft_revision,content_hash,actor_id,reviewed_claim_ids,version_id) VALUES($1,$2,$3,3,$4,$5,ARRAY[]::uuid[],$6)",
    [randomUUID(), s.u.workspaceId, s.projectId, hash(changed), owner, version],
  );
  const submitted = await submit({ ...s, etag: `"draft:${s.projectId}:3"` });
  assert.equal(submitted.statusCode, 202, submitted.body);
  const binding = (
    await h.db.query(
      "SELECT provider_binding FROM newbert.generation_jobs WHERE id=$1",
      [submitted.json().id],
    )
  ).rows[0].provider_binding;
  assert.equal(binding.allowNewSpeech, false);
  const lease = await claimNext(h.worker, randomUUID());
  assert(lease);
  let speech = 0;
  await runProduction(h.worker, lease, h.media, {
    eligibility: entitled,
    synthesize: async () => {
      speech++;
      throw Error("must not call");
    },
    measureAudio,
    renderVideo: async () => {
      throw new ProductionError("ENCODER_FAILED");
    },
  });
  assert.equal(speech, 0);
  const outputs = (
    await h.call(
      "/api/v1/projects/" + s.projectId + "/outputs",
      "GET",
      undefined,
      s.u.cookie,
    )
  ).json();
  assert.equal(outputs.items.length, 1);
  assert.equal(outputs.items[0].id, before.id);
  assert.equal(outputs.items[0].latestGood, true);
  const failed = await h.call(
    "/api/v1/jobs/" + lease.id,
    "GET",
    undefined,
    s.u.cookie,
  );
  const retry = await h.call(
    "/api/v1/jobs/" + lease.id + "/retry",
    "POST",
    { allowNewProviderRequest: false },
    s.u.cookie,
    {
      "X-CSRF-Token": s.u.csrf,
      "If-Match": String(failed.headers.etag),
      "Idempotency-Key": randomUUID(),
    },
  );
  assert.equal(retry.statusCode, 202, retry.body);
  const next = await claimNext(h.worker, randomUUID());
  assert(next);
  await runProduction(h.worker, next, h.media, {
    eligibility: async () => {
      throw Error("no eligibility call on reuse");
    },
    synthesize: async () => {
      speech++;
      throw Error("no speech");
    },
    measureAudio,
    renderVideo,
  });
  assert.equal(speech, 0);
  const firstPage = await h.call(
    "/api/v1/projects/" + s.projectId + "/outputs?limit=1",
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(firstPage.json().items.length, 1);
  assert.equal(firstPage.json().items[0].versionId, version);
  assert.equal(firstPage.json().items[0].latestGood, true);
  assert(firstPage.json().nextCursor);
  const secondPage = await h.call(
    "/api/v1/projects/" +
      s.projectId +
      "/outputs?limit=1&cursor=" +
      encodeURIComponent(firstPage.json().nextCursor),
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(secondPage.json().items[0].id, before.id);
  assert.equal(secondPage.json().items[0].latestGood, false);
  assert.equal(secondPage.json().nextCursor, null);
  const changedSpeech = structuredClone(changed);
  changedSpeech.pronunciationOverrides = [
    { displayText: "विचार", spokenText: "vichaar" },
  ] as never;
  assert.notEqual(
    speechManifest(changedSpeech, speechConfig()).fingerprint,
    speechManifest(changed, speechConfig()).fingerprint,
  );
});
