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
test("pronunciation changes only spoken text and preserves Unicode display/timing spans", () => {
  const c = content();
  c.pronunciationOverrides = [
    { displayText: "विचार", spokenText: "vichaar" },
  ] as never;
  const m = speechManifest(c, speechConfig());
  assert(m.text.includes("vichaar"));
  const t = align(m, response(m.text).alignment, 3.03);
  assert(t.timeline[0].captions.some((c: any) => c.text.includes("विचार")));
  assert.equal(t.timeline[0].end, 3.03);
  const bad = structuredClone(response(m.text).alignment);
  bad.character_end_times_seconds[0] = -1;
  assert.throws(() => align(m, bad, 3.03));
  assert.throws(() => align(m, { ...bad, characters: ["wrong"] }, 3.03));
});
test("shared controlled scene operations serve preview/export and reject unsafe overflow", () => {
  const c = content();
  const m = speechManifest(c, speechConfig()),
    t = align(m, response(m.text).alignment, 3.03);
  const ops = sceneOps(t.timeline[0], 0);
  assert(ops.some((o) => o.type === "text" && o.text?.includes("विचार")));
  assert(frameSvg(t.timeline, 1).startsWith("<svg"));
  const tooLong = structuredClone(t.timeline[0]);
  tooLong.title = "W".repeat(120);
  assert.throws(() => sceneOps(tooLong, 0));
});
test("speech preflight rejects paid tiers, inaccessible voices and insufficient provider quota", async () => {
  const mock = (tier: string, count = 0) =>
    (async (url: any) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("subscription")
            ? {
                tier,
                character_limit: 1000,
                character_count: count,
                can_extend_character_limit: false,
                max_credit_limit_extension: 0,
              }
            : { voice_id: "testvoice", name: "Test" },
        ),
      )) as typeof fetch;
  assert.equal((await eligibility("testvoice", 10, mock("free"))).tier, "free");
  await assert.rejects(
    eligibility("testvoice", 10, mock("creator")),
    (e: any) => e.code === "FREE_PLAN_REQUIRED",
  );
  await assert.rejects(
    eligibility("testvoice", 10, mock("free", 999)),
    (e: any) => e.code === "SPEECH_PROVIDER_QUOTA",
  );
});
test("timestamped TTS uses only the selected voice/model and treats network ambiguity as unknown", async () => {
  let payload: any;
  const value = await synthesize("Example", "testvoice", (async (
    url: any,
    init: any,
  ) => {
    assert(String(url).includes("/testvoice/with-timestamps"));
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify(response("Example")));
  }) as typeof fetch);
  assert(value.audio_base64);
  assert.equal(payload.model_id, "eleven_multilingual_v2");
  assert.equal(payload.apply_text_normalization, "off");
  await assert.rejects(
    synthesize("Example", "testvoice", (async () => {
      throw new Error("timeout");
    }) as typeof fetch),
    (e: any) => e.uncertain && e.code === "SPEECH_OUTCOME_UNKNOWN",
  );
});
test("production admission is idempotent and reserves exact approved version and media units", async () => {
  const s = await seed(),
    key = randomUUID();
  const [a, b] = await Promise.all([submit(s, key), submit(s, key)]);
  assert.equal(a.statusCode, 202, a.body);
  assert.equal(b.json().id, a.json().id);
  assert.equal(a.json().versionId, s.versionId);
  const buckets = (
    await h.db.query(
      "SELECT resource,reserved_units FROM newbert.usage_buckets WHERE workspace_id=$1",
      [s.u.workspaceId],
    )
  ).rows;
  assert.equal(
    buckets.find((b) => b.resource === "narration_ms")?.reserved_units,
    "120000",
  );
  assert.equal(
    (
      await h.call(
        "/api/v1/jobs/" + a.json().id,
        "GET",
        undefined,
        (await h.user()).cookie,
      )
    ).statusCode,
    404,
  );
});
test(
  "real encoder produces a validated private MP4 and terminal accounting is exact",
  async () => {
    const s = await seed();
    const admitted = await submit(s);
    assert.equal(admitted.statusCode, 202, admitted.body);
    const lease = await claimNext(h.worker, "production-test");
    assert(lease);
    let calls = 0;
    await runProduction(h.worker, lease, h.media, {
      eligibility: entitled,
      synthesize: async (text: string) => {
        calls++;
        return response(text);
      },
      measureAudio,
      renderVideo,
    });
    const state = await h.call(
      "/api/v1/jobs/" + lease.id,
      "GET",
      undefined,
      s.u.cookie,
    );
    assert.equal(state.json().state, "succeeded", state.body);
    assert(state.json().outputArtifactId);
    assert.equal(calls, 1);
    const artifact = (
      await h.db.query("SELECT * FROM newbert.artifacts WHERE id=$1", [
        state.json().outputArtifactId,
      ])
    ).rows[0];
    assert.equal(artifact.metadata.validation.passed, true);
    assert.equal(artifact.metadata.validation.width, 720);
    assert.equal(
      (
        await h.db.query(
          "SELECT count(*)::int AS n FROM newbert.artifact_dependencies WHERE artifact_id=$1",
          [artifact.id],
        )
      ).rows[0].n,
      5,
    );
    const audioArtifacts = (
      await h.db.query("SELECT * FROM newbert.artifacts WHERE kind='audio'")
    ).rows;
    assert.equal(audioArtifacts.length, 1);
    results.push(
      "Real FFmpeg/ASS H.264+Aac vertical MP4, full decode, actual narration timing, private dependencies and ledger passed",
    );
  },
  { timeout: 180000 },
);
test("uncertain speech outcome preserves reservations and is not offered as Ready", async () => {
  const s = await seed();
  await submit(s);
  const lease = await claimNext(h.worker, "uncertain");
  assert(lease);
  await runProduction(h.worker, lease, h.media, {
    eligibility: entitled,
    synthesize: async () => {
      throw new ProductionError("SPEECH_OUTCOME_UNKNOWN", true);
    },
    measureAudio,
    renderVideo,
  });
  const row = (
    await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, s.u.cookie)
  ).json();
  assert.equal(row.state, "paused");
  assert.equal(row.pauseReason, "PROVIDER_OUTCOME_UNKNOWN");
  assert.equal(row.outputArtifactId, null);
  const duplicateProject = await seed(s.u);
  const duplicate = await submit(duplicateProject);
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(duplicate.json().code, "RECONCILIATION_REQUIRED");
  assert.equal(
    (
      await h.db.query(
        "SELECT reserved_units FROM newbert.usage_buckets WHERE resource='provider_credits'",
      )
    ).rows[0].reserved_units,
    String(speechManifest(s.content, speechConfig()).characters),
  );
});
test("already queued duplicate narration cannot repeat an unknown speech request", async () => {
  const first = await seed();
  const second = await seed(first.u);
  assert.equal((await submit(first)).statusCode, 202);
  assert.equal((await submit(second)).statusCode, 202);
  let calls = 0;
  const deps = {
    eligibility: entitled,
    synthesize: async () => {
      calls++;
      throw new ProductionError("SPEECH_OUTCOME_UNKNOWN", true);
    },
    measureAudio, renderVideo,
  };
  const one = await claimNext(h.worker, "first-duplicate");
  assert(one);
  await runProduction(h.worker, one, h.media, deps);
  const two = await claimNext(h.worker, "second-duplicate");
  assert(two);
  await runProduction(h.worker, two, h.media, deps);
  const state = (await h.call("/api/v1/jobs/"+two.id,"GET",undefined,first.u.cookie)).json();
  assert.equal(state.state,"paused");
  assert.equal(state.pauseReason,"NARRATION_REQUEST_UNRESOLVED");
  assert.equal(calls,1);
  assert.equal((await h.db.query("SELECT count(*)::int AS n FROM newbert.speech_calls")).rows[0].n,1);
});

test("measured over-duration narration pauses without trimming or rendering", async () => {
  const s = await seed();
  await h.db.query("UPDATE newbert.production_limits SET max_duration_ms=2000");
  await submit(s);
  const lease = await claimNext(h.worker, "too-long");
  assert(lease);
  let renders = 0;
  await runProduction(h.worker, lease, h.media, {
    eligibility: entitled,
    synthesize: async (text: string) => response(text),
    measureAudio,
    renderVideo: async () => {
      renders++;
      throw new Error("must not run");
    },
  });
  const row = (
    await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, s.u.cookie)
  ).json();
  assert.equal(row.state, "paused");
  assert.equal(row.pauseReason, "NARRATION_DURATION_LIMIT");
  assert.equal(renders, 0);
  assert.equal(
    (
      await h.db.query(
        "SELECT count(*)::int AS n FROM newbert.artifacts WHERE kind='audio'",
      )
    ).rows[0].n,
    1,
  );
});

test("render retry reuses validated narration and never submits speech again", async () => {
  const s = await seed();
  const first = await submit(s);
  assert.equal(first.statusCode, 202, first.body);
  const lease = await claimNext(h.worker, "render-fail");
  assert(lease);
  let calls = 0;
  const speech = async (text: string) => {
    calls++;
    return response(text);
  };
  await runProduction(h.worker, lease, h.media, {
    eligibility: entitled,
    synthesize: speech,
    measureAudio,
    renderVideo: async () => {
      throw new ProductionError("ENCODER_FAILED");
    },
  });
  const failed = await h.call(
    "/api/v1/jobs/" + lease.id,
    "GET",
    undefined,
    s.u.cookie,
  );
  assert.equal(failed.json().state, "failed", failed.body);
  const retried = await h.call(
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
  assert.equal(retried.statusCode, 202, retried.body);
  const next = await claimNext(h.worker, "render-retry");
  assert(next);
  await runProduction(h.worker, next, h.media, {
    eligibility: async () => {
      throw new Error("must reuse");
    },
    synthesize: speech,
    measureAudio,
    renderVideo,
  });
  assert.equal(
    (
      await h.call("/api/v1/jobs/" + next.id, "GET", undefined, s.u.cookie)
    ).json().state,
    "succeeded",
  );
  assert.equal(calls, 1);
});
test("a reuse-only retry never buys speech if its cached narration disappears", async () => {
  const s = await seed();
  assert.equal((await submit(s)).statusCode,202);
  const one = await claimNext(h.worker,"cache-producer");
  assert(one);
  await runProduction(h.worker,one,h.media,{
    eligibility:entitled, synthesize:async(text:string)=>response(text), measureAudio,
    renderVideo:async()=>{throw new ProductionError("ENCODER_FAILED");},
  });
  const failed = await h.call("/api/v1/jobs/"+one.id,"GET",undefined,s.u.cookie);
  assert.equal(failed.json().state,"failed",failed.body);
  const retried = await h.call("/api/v1/jobs/"+one.id+"/retry","POST",{allowNewProviderRequest:false},s.u.cookie,{
    "X-CSRF-Token":s.u.csrf,"If-Match":String(failed.headers.etag),"Idempotency-Key":randomUUID(),
  });
  assert.equal(retried.statusCode,202,retried.body);
  await h.db.query("UPDATE newbert.artifacts SET storage_status='deleted' WHERE kind='audio'");
  const two = await claimNext(h.worker,"cache-consumer");
  assert(two);
  let calls=0;
  await runProduction(h.worker,two,h.media,{
    eligibility:entitled,synthesize:async(text:string)=>{calls++;return response(text);},measureAudio,renderVideo,
  });
  const state=(await h.call("/api/v1/jobs/"+two.id,"GET",undefined,s.u.cookie)).json();
  assert.equal(state.state,"paused");
  assert.equal(state.pauseReason,"NARRATION_NOT_REUSABLE");
  assert.equal(calls,0);
});

test("another workspace never reuses private narration with an identical speech fingerprint", async () => {
  let calls = 0;
  for (let i = 0; i < 2; i++) {
    const s = await seed();
    const r = await submit(s);
    assert.equal(r.statusCode, 202, r.body);
    const lease = await claimNext(h.worker, "private-" + i);
    assert(lease);
    await runProduction(h.worker, lease, h.media, {
      eligibility: entitled,
      synthesize: async (text: string) => {
        calls++;
        return response(text);
      },
      measureAudio,
      renderVideo,
    });
    assert.equal(
      (
        await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, s.u.cookie)
      ).json().state,
      "succeeded",
    );
  }
  assert.equal(calls, 2);
});
test("speech budget migration preserves custom storage policy limits", async () => {
  const name="newbert_f9_migration_"+randomUUID().replaceAll("-", "");
  await h.db.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
  const params=(h.db as any).connectionParameters;
  const db=new pg.Client({host:params.host,port:params.port,user:params.user,password:params.password,database:name});
  const directory=resolve("test-results/f9-migration",randomUUID());
  try {
    await db.connect();
    await mkdir(directory,{recursive:true});
    for(const file of await readdir(migrationDirectory))
      if(file.endsWith(".sql") && file < "1793318400011")
        await writeFile(directory+"/"+file,await readFile(migrationDirectory+"/"+file));
    await migrate(db,directory);
    await db.query("UPDATE newbert.processing_policy SET storage_bytes_limit=1234567,platform_storage_bytes_limit=23456789");
    await migrate(db);
    const row=(await db.query("SELECT storage_bytes_limit,platform_storage_bytes_limit FROM newbert.processing_policy")).rows[0];
    assert.equal(row.storage_bytes_limit,"1234567");
    assert.equal(row.platform_storage_bytes_limit,"23456789");
  } finally {
    await db.end();
    await h.db.query(`DROP DATABASE ${pg.escapeIdentifier(name)}`);
  }
});

test("stale approval and exhausted media admission cannot create an orphan job or debit", async () => {
  const s = await seed();
  await h.db.query("UPDATE newbert.production_limits SET global_characters=0");
  const rejected = await submit(s);
  assert.equal(rejected.statusCode, 429, rejected.body);
  assert.equal(
    (await h.db.query("SELECT count(*)::int AS n FROM newbert.generation_jobs"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (
      await h.db.query(
        "SELECT count(*)::int AS n FROM newbert.usage_reservations",
      )
    ).rows[0].n,
    0,
  );
  await h.db.query(
    "UPDATE newbert.production_limits SET global_characters=4000",
  );
  const changed = await h.call(
    "/api/v1/projects/" + s.projectId + "/draft",
    "PATCH",
    { content: { ...s.content, style: { preset: "standard" } } },
    s.u.cookie,
    { "X-CSRF-Token": s.u.csrf, "If-Match": s.etag },
  );
  assert.equal(changed.statusCode, 200);
  s.etag = String(changed.headers.etag);
  assert.equal((await submit(s)).statusCode, 409);
});
