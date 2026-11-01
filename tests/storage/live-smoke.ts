// Explicit opt-in live test: uploads one synthetic MP4; never calls AI providers.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { platform, brief } from "../support/platform.js";
import { createMediaStore } from "../../packages/database/src/supabase-media.js";
import { claimNext } from "../../apps/api/src/modules/processing/queue.js";
import { saveArtifact } from "../../apps/api/src/modules/processing/artifacts.js";
if (process.env.RUN_SUPABASE_SMOKE !== "true") throw Error("Explicit live storage test opt-in required.");
const media=createMediaStore({...process.env,MEDIA_STORAGE_PROVIDER:"supabase"});
assert.equal(await media.ready(),true,"Private bucket readiness");
const h=await platform(undefined,undefined,media);
try {
  const owner=await h.user(),other=await h.user();
  const headers={"X-CSRF-Token":owner.csrf,"Idempotency-Key":randomUUID()};
  const project=await h.call("/api/v1/projects","POST",{title:"Storage smoke fixture",brief},owner.cookie,headers);
  assert.equal(project.statusCode,201);
  const prefix="/api/v1/projects/"+project.json().id;
  const draft=await h.call(prefix+"/draft","GET",undefined,owner.cookie);
  const job=await h.call(prefix+"/jobs","POST",{kind:"plan",acknowledgedUsageTerms:true},owner.cookie,{...headers,"Idempotency-Key":randomUUID(),"If-Match":String(draft.headers.etag)});
  assert.equal(job.statusCode,202);
  const lease=await claimNext(h.worker,"supabase-storage-smoke"); assert.ok(lease);
  const bytes=await readFile("test-results/studio-render/video.mp4");
  const artifact=await saveArtifact(h.worker,media,lease,{kind:"video",mimeType:"video/mp4",bytes,inputFingerprint:"0".repeat(64)});
  assert.ok(artifact);
  const result=await h.call("/api/v1/artifacts/"+artifact+"/access","POST",{purpose:"preview"},owner.cookie,{...headers,"Idempotency-Key":randomUUID()});
  assert.equal(result.statusCode,200);
  const url=new URL(result.json().url),path=url.pathname+url.search;
  const full=await h.call(path,"GET",undefined,owner.cookie);
  assert.equal(full.statusCode,200);assert.deepEqual(full.rawPayload,bytes);
  const range=await h.call(path,"GET",undefined,owner.cookie,{Range:"bytes=0-127"});
  assert.equal(range.statusCode,206);assert.deepEqual(range.rawPayload,bytes.subarray(0,128));
  assert.equal((await h.call(path,"GET",undefined,other.cookie)).statusCode,403);
  assert.equal((await h.call(path)).statusCode,401);
  const report={date:new Date().toISOString(),provider:"supabase",privateBucket:true,uploadedBytes:bytes.length,objectKey:owner.workspaceId+"/"+artifact,checks:["private bucket readiness","fenced worker artifact save","authenticated full MP4 byte equality","HTTP 206 ranged playback","other workspace rejected","anonymous playback rejected"],database:"isolated disposable test database",aiProviderCalls:0,note:"One synthetic QA video retained in private bucket; no user project modified."};
  await mkdir("docs/storage",{recursive:true});await writeFile("docs/storage/supabase-validation.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report));
} finally {await h.close();}
