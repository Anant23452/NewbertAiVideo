import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
import { claimNext } from "../../apps/api/src/modules/processing/queue.js";
import { runPlanning } from "../../apps/api/src/modules/planning/runner.js";
import {
  buildPlan,
  checkScenes,
} from "../../apps/api/src/modules/planning/validation.js";
import { PlanningError } from "../../apps/api/src/modules/planning/providers.js";
import {generate,research} from '../../apps/api/src/modules/planning/providers.js';
let h: Awaited<ReturnType<typeof platform>>;
before(
  async () => {
    process.env.ELEVENLABS_VOICE_ID = "local-test-voice";
    process.env.GEMINI_API_KEY='test-only-not-a-real-key';
    h = await platform();
  },
  { timeout: 180000 },
);
after(async () => {
  await h?.close();
});
const quote =
  "The spotlight effect is the phenomenon in which people tend to believe they are being noticed more than they really are.";
const sources = [
  {
    id: randomUUID(),
    title: "Spotlight effect",
    url: "https://en.wikipedia.org/wiki/Spotlight_effect",
    excerpt: quote,
    retrievedAt: new Date().toISOString(),
  },
];
const output = {
  scenes: [0, 1, 2].map((i) => ({
    title: "Scene " + (i + 1),
    narration:
      "हमें लगता है कि सभी लोग हमें देख रहे हैं। इस विचार को एक आसान उदाहरण से समझें।",
    purpose: "Explain the idea",
    component: "diagram",
    labels: ["You", "Other people"],
    claims: [{ text: quote, classification: "factual", sourceIndex: 0, quote }],
  })),
};
async function submit(automatic=false) {
  const u = await h.user();
  const p = await h.call(
    "/api/v1/projects",
    "POST",
    { title: "Planning test", brief: {...brief,...(automatic?{mode:"automatic"}:{})} },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "Idempotency-Key": randomUUID() },
  );
  assert.equal(p.statusCode, 201, p.body);
  const prefix = "/api/v1/projects/" + p.json().id;
  const d = await h.call(prefix + "/draft", "GET", undefined, u.cookie);
  const j = await h.call(
    prefix + "/jobs",
    "POST",
    { kind: "plan", acknowledgedUsageTerms: true },
    u.cookie,
    {
      "X-CSRF-Token": u.csrf,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(d.headers.etag),
    },
  );
  assert.equal(j.statusCode, 202, j.body);
  const lease = await claimNext(h.worker, "test-planner");
  assert.ok(lease);
  return { u, prefix, j, lease };
}
test("source provenance never turns invented citations into supported facts", () => {
  const base = {
    schemaVersion: 1,
    brief,
    voice: null,
    style: { preset: "black_glow" },
    scenes: [],
    pronunciationOverrides: [],
    captionOverrides: [],
  };
  const plan = buildPlan(output, base, sources);
  assert.equal(plan.claims[0]!.status, "needs_review");
  assert.deepEqual(plan.claims[0]!.sourceIds, [sources[0]!.id]);
  const invented = structuredClone(output);
  invented.scenes[0]!.claims[0]!.quote =
    "An invented citation that was never retrieved.";
  assert.equal(
    buildPlan(invented, base, sources).claims[0]!.status,
    "unsupported",
  );
});
test("controlled scene validation rejects code, duplicate scenes and invalid Unicode cues", () => {
  const base = {
    schemaVersion: 1,
    brief,
    voice: null,
    style: { preset: "black_glow" },
    scenes: [],
    pronunciationOverrides: [],
    captionOverrides: [],
  };
  const plan = buildPlan(output, base, sources);
  const bad = structuredClone(plan.content);
  bad.scenes[0].objects[0].parameters = { code: "alert(1)" };
  assert.throws(() => checkScenes(bad));
  const duplicate = structuredClone(plan.content);
  duplicate.scenes[1].id = duplicate.scenes[0].id;
  assert.throws(() => checkScenes(duplicate));
  const span = structuredClone(plan.content);
  span.scenes[0].cues[0].spokenSpan.end = 99999;
  assert.throws(() => checkScenes(span));
});
test("worker plans, persists evidence/artifact and supports conflict-aware application and exact approval", async () => {
  const { u, prefix, j, lease } = await submit();
  await runPlanning(
    h.worker,
    lease,
    h.media,
    { research: async () => sources, generate: async () => output },
    true,
  );
  const done = await h.call(
    "/api/v1/jobs/" + j.json().id,
    "GET",
    undefined,
    u.cookie,
  );
  assert.equal(done.json().state, "succeeded", done.body);
  const evidence = await h.call(
    "/api/v1/versions/" + j.json().versionId + "/evidence",
    "GET",
    undefined,
    u.cookie,
  );
  assert.equal(evidence.json().sources.length, 1);
  assert.equal(evidence.json().claims.length, 3);
  const d = await h.call(prefix + "/draft", "GET", undefined, u.cookie);
  const headers = {
    "X-CSRF-Token": u.csrf,
    "Idempotency-Key": randomUUID(),
    "If-Match": String(d.headers.etag),
  };
  const applied = await h.call(
    prefix + "/draft/apply-result",
    "POST",
    { artifactId: done.json().outputArtifactId },
    u.cookie,
    headers,
  );
  assert.equal(applied.statusCode, 200, applied.body);
  assert.equal(
    (
      await h.call(
        prefix + "/draft/apply-result",
        "POST",
        { artifactId: done.json().outputArtifactId },
        u.cookie,
        { ...headers, "Idempotency-Key": randomUUID() },
      )
    ).statusCode,
    412,
  );
  const voices = (
    await h.call("/api/v1/voices", "GET", undefined, u.cookie)
  ).json().items;
  assert.ok(voices.length, "Local test requires the configured operator voice");
  const content = {
    ...applied.json().content,
    voice: {
      catalogVoiceId: voices[0].catalogVoiceId,
      providerConnectionId: null,
    },
  };
  let saved = await h.call(
    prefix + "/draft",
    "PATCH",
    { content },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "If-Match": String(applied.headers.etag) },
  );
  assert.equal(saved.statusCode, 200, saved.body);
  const changedDisplay = structuredClone(content);
  const scene = changedDisplay.scenes[0];
  scene.displayNarration += " This new assertion is absent from the evidence plan.";
  scene.textMappings = [{
    spokenSpan: { start: 0, end: [...scene.spokenNarration].length },
    displaySpan: { start: 0, end: [...scene.displayNarration].length },
  }];
  const displaySaved = await h.call(prefix + "/draft", "PATCH", {content:changedDisplay}, u.cookie, {
    "X-CSRF-Token":u.csrf, "If-Match":String(saved.headers.etag),
  });
  assert.equal(displaySaved.statusCode, 200, displaySaved.body);
  const displayApproval = await h.call(prefix + "/storyboard/approve", "POST", {
    reviewedClaimIds:evidence.json().claims.map((c:any)=>c.id), acknowledgedVoiceTerms:true,
  }, u.cookie, {"X-CSRF-Token":u.csrf,"If-Match":String(displaySaved.headers.etag),"Idempotency-Key":randomUUID()});
  assert.equal(displayApproval.statusCode,409,displayApproval.body);
  assert.equal(displayApproval.json().code,"SCRIPT_CHANGED");
  saved = await h.call(prefix + "/draft", "PATCH", {content}, u.cookie, {
    "X-CSRF-Token":u.csrf, "If-Match":String(displaySaved.headers.etag),
  });
  assert.equal(saved.statusCode,200,saved.body);
  const reviewHeaders = {
    "X-CSRF-Token": u.csrf,
    "Idempotency-Key": randomUUID(),
    "If-Match": String(saved.headers.etag),
  };
  assert.equal(
    (
      await h.call(
        prefix + "/storyboard/approve",
        "POST",
        { reviewedClaimIds: [], acknowledgedVoiceTerms: true },
        u.cookie,
        reviewHeaders,
      )
    ).statusCode,
    409,
  );
  const approved = await h.call(
    prefix + "/storyboard/approve",
    "POST",
    {
      reviewedClaimIds: evidence.json().claims.map((c: any) => c.id),
      acknowledgedVoiceTerms: true,
    },
    u.cookie,
    { ...reviewHeaders, "Idempotency-Key": randomUUID() },
  );
  assert.equal(approved.statusCode, 200, approved.body);
  const approvedId = approved.json().approval.version_id;
  assert.ok(approvedId);
  assert.equal(
    (
      await h.call(
        "/api/v1/versions/" + approvedId + "/evidence",
        "GET",
        undefined,
        u.cookie,
      )
    ).json().claims.length,
    3,
  );
  const changed = await h.call(
    prefix + "/draft",
    "PATCH",
    { content: { ...content, style: { preset: "standard" } } },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "If-Match": String(saved.headers.etag) },
  );
  assert.equal(changed.statusCode, 200);
  assert.equal(
    (await h.call(prefix + "/storyboard", "GET", undefined, u.cookie)).json()
      .approval,
    null,
  );
  const auto = await h.call(
    prefix + "/draft",
    "PATCH",
    { content: { ...content, brief: { ...content.brief, mode: "automatic" } } },
    u.cookie,
    { "X-CSRF-Token": u.csrf, "If-Match": String(changed.headers.etag) },
  );
  assert.equal(auto.statusCode, 200, auto.body);
  const denied = await h.call(
    prefix + "/storyboard/approve",
    "POST",
    {
      reviewedClaimIds: evidence.json().claims.map((c: any) => c.id),
      acknowledgedVoiceTerms: true,
    },
    u.cookie,
    {
      "X-CSRF-Token": u.csrf,
      "Idempotency-Key": randomUUID(),
      "If-Match": String(auto.headers.etag),
    },
  );
  assert.equal(denied.statusCode, 409, denied.body);
  const other = await h.user();
  assert.equal(
    (await h.call(prefix + "/storyboard", "GET", undefined, other.cookie))
      .statusCode,
    404,
  );
});
test("discussion is queued and assistant response is persisted only by the worker", async () => {
  const { u, prefix, lease } = await submit();
  await runPlanning(
    h.worker,
    lease,
    h.media,
    { research: async () => sources, generate: async () => output },
    false,
  );
  const jr = await h.call(
    "/api/v1/jobs/" + lease.id,
    "GET",
    undefined,
    u.cookie,
  );
  await h.call("/api/v1/jobs/" + lease.id + "/cancel", "POST", {}, u.cookie, {
    "X-CSRF-Token": u.csrf,
    "If-Match": String(jr.headers.etag),
    "Idempotency-Key": randomUUID(),
  });
  const d = await h.call(prefix + "/draft", "GET", undefined, u.cookie);
  const sent = await h.call(
    prefix + "/messages",
    "POST",
    { content: "Give me three angles for this topic" },
    u.cookie,
    {
      "X-CSRF-Token": u.csrf,
      "If-Match": String(d.headers.etag),
      "Idempotency-Key": randomUUID(),
    },
  );
  assert.equal(sent.statusCode, 202, sent.body);
  const next = await claimNext(h.worker, "discussion");
  assert.ok(next);
  await runPlanning(
    h.worker,
    next,
    h.media,
    {
      research: async () => [],
      generate: async () => ({
        reply:
          "Try a college classroom, a public speaking example, or a social media example. Which audience matters most?",
      }),
    },
    true,
  );
  const list = await h.call(prefix + "/messages", "GET", undefined, u.cookie);
  assert.equal(list.json().items.length, 2);
  assert.ok(list.json().items.some((m: any) => m.role === "assistant"));
});
test("uncertain provider outcome is never blindly repeated and daily call counters persist", async () => {
  const { u, lease } = await submit();
  await runPlanning(
    h.worker,
    lease,
    h.media,
    {
      research: async () => sources,
      generate: async () => {
        throw new Error("Unexpected adapter failure after submitting the request");
      },
    },
    true,
  );
  const state = (
    await h.call("/api/v1/jobs/" + lease.id, "GET", undefined, u.cookie)
  ).json();
  assert.equal(state.state, "paused");
  assert.equal(state.pauseReason, "PROVIDER_OUTCOME_UNKNOWN");
  const attempt = await h.db.query("SELECT state FROM newbert.job_attempts WHERE job_id=$1",[lease.id]);
  assert.equal(attempt.rows[0].state,"unknown");
  const resumed = await h.call("/api/v1/jobs/"+lease.id+"/resume","POST",{},u.cookie,{
    "X-CSRF-Token":u.csrf,"If-Match":`"job:${lease.id}:${state.revision}"`,"Idempotency-Key":randomUUID(),
  });
  assert.equal(resumed.statusCode,409,resumed.body);
  assert.equal(
    (
      await h.db.query(
        "SELECT count(*)::int AS n FROM newbert.planning_calls WHERE workspace_id=$1",
        [u.workspaceId],
      )
    ).rows[0].n,
    1,
  );
});

test('automatic plans apply only when no unresolved factual claim blocks them',async()=>{const x=await submit(true);const interpreted=structuredClone(output);for(const scene of interpreted.scenes)for(const claim of scene.claims)claim.classification='interpretation';await runPlanning(h.worker,x.lease,h.media,{research:async()=>sources.map(s=>({...s,id:randomUUID()})),generate:async()=>interpreted},true);const d=await h.call(x.prefix+'/storyboard','GET',undefined,x.u.cookie);assert.equal(d.statusCode,200,d.body);assert.equal(d.json().content.scenes.length,3);assert.equal(d.json().planningVersionId,x.j.json().versionId);assert.equal(d.json().approval,null);});
test("global provider-call cap pauses without submitting an extra request", async () => {
  await h.db.query("UPDATE newbert.planning_calls SET created_at=now()");
  const used = (
    await h.db.query("SELECT count(*)::int AS n FROM newbert.planning_calls")
  ).rows[0].n;
  for (let i = used; i < 4; i++) {
    const x = await submit();
    await runPlanning(
      h.worker,
      x.lease,
      h.media,
      {
        research: async () => sources.map((s) => ({ ...s, id: randomUUID() })),
        generate: async () => output,
      },
      true,
    );
  }
  const x = await submit();
  let called = false;
  await runPlanning(
    h.worker,
    x.lease,
    h.media,
    {
      research: async () => sources,
      generate: async () => {
        called = true;
        return output;
      },
    },
    true,
  );
  assert.equal(called, false);
  assert.equal(
    (
      await h.call("/api/v1/jobs/" + x.lease.id, "GET", undefined, x.u.cookie)
    ).json().pauseReason,
    "PLANNING_DAILY_LIMIT",
  );
});

test('Gemini HTTP adapter uses the fixed endpoint, structured JSON, bounded output and no grounding tools',async()=>{let request:any;const mock=async(url:any,init:any)=>{request={url,init};return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({reply:'A test reply'})}]}}]}));};const result=await generate({topic:'example'},true,mock as typeof fetch);assert.equal(result.reply,'A test reply');assert(String(request.url).startsWith('https://generativelanguage.googleapis.com/v1beta/models/'));const body=JSON.parse(request.init.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.maxOutputTokens,7000);assert.equal(body.tools,undefined);await assert.rejects(generate({},false,(async()=>new Response('{}',{status:429})) as typeof fetch),(e:any)=>e.code==='PROVIDER_QUOTA'&&!e.uncertain);await assert.rejects(generate({},false,(async()=>{throw new Error('network');}) as typeof fetch),(e:any)=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&e.uncertain);});
test('research accepts only retrieved Wikipedia article URLs and bounded excerpts',async()=>{const result=await research('a topic',(async()=>new Response(JSON.stringify({query:{pages:[{title:'Safe',fullurl:'https://en.wikipedia.org/wiki/Example',extract:'A'.repeat(4000)},{title:'Bad',fullurl:'http://127.0.0.1/private',extract:'B'.repeat(1000)}]}}))) as typeof fetch);assert.equal(result.length,1);assert.equal(result[0]!.excerpt.length,2500);});

test('Hindi research fallback preserves vowel marks and removes complete filler words', async () => {
  const queries: string[] = [];
  await research('सूर्य ऊर्जा कैसे है', (async (input: any) => {
    queries.push(new URL(String(input)).searchParams.get('gsrsearch')!);
    return new Response('{}');
  }) as typeof fetch);
  assert.deepEqual(queries, ['सूर्य ऊर्जा कैसे है', 'सूर्य* ऊर्जा*']);
});

test('empty full-topic search uses at most one keyword-prefix retry without inventing evidence',async()=>{const queries:string[]=[];const result=await research('Dopamin Detox how to do',(async(input:any)=>{const q=new URL(String(input)).searchParams.get('gsrsearch')!;queries.push(q);return new Response(JSON.stringify(queries.length===1?{}:{query:{pages:[{title:'Dopamine fasting',fullurl:'https://en.wikipedia.org/wiki/Dopamine_fasting',extract:'Retrieved factual source excerpt. '.repeat(10)}]}}));}) as typeof fetch);assert.equal(queries.length,2);assert.equal(queries[1],'dopamin* detox*');assert.equal(result[0]!.title,'Dopamine fasting');let count=0;assert.deepEqual(await research('No matching topic',(async()=>{count++;return new Response('{}');}) as typeof fetch),[]);assert.equal(count,2);});
