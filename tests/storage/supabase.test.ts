import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { SupabaseMediaStore, createMediaStore } from "../../packages/database/src/supabase-media.js";
import { LocalMediaStore, type MediaStore } from "../../packages/database/src/media.js";

const url = "https://storagefixture.supabase.co";
const secret = "sb_secret_fixture";
const bucket = "newbert-media";
const workspace = randomUUID(), artifact = randomUUID(), key = workspace + "/" + artifact;
function fixture(options: {public?: boolean; max?: number; failure?: number; legacy?: MediaStore} = {}) {
  const objects = new Map<string, Buffer>();
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    assert.equal((init?.headers as Record<string,string>).apikey, secret);
    assert.equal(init?.redirect, "error");
    if (path === "/storage/v1/bucket/" + bucket)
      return Response.json({id:bucket, public:options.public ?? false});
    if (options.failure) return new Response("private upstream details", {status:options.failure});
    if (init?.method === "POST") {
      assert.equal((init.headers as Record<string,string>)["x-upsert"], "false");
      const name = path.replace("/storage/v1/object/"+bucket+"/", "");
      if (objects.has(name)) return new Response("exists",{status:400});
      objects.set(name, Buffer.from(init.body as Uint8Array));
      return Response.json({Key:name});
    }
    const name = path.replace("/storage/v1/object/authenticated/"+bucket+"/", "");
    const bytes = objects.get(name);
    return bytes ? new Response(new Uint8Array(bytes)) : Response.json({statusCode:"404"},{status:400});
  };
  return {objects, store:new SupabaseMediaStore(url,secret,bucket,options.max ?? 1024,options.legacy,fetcher)};
}
test("private bucket upload/download retains exact bytes, key and integrity metadata", async()=>{
  const {store}=fixture(); const bytes=Buffer.from("private video fixture");
  assert.equal(await store.ready(),true);
  assert.deepEqual(await store.put(workspace,artifact,bytes),{key,byteSize:bytes.length,contentHash:createHash("sha256").update(bytes).digest("hex")});
  assert.deepEqual(await store.get(key),bytes);
  await assert.rejects(store.put(workspace,artifact,Buffer.from("replacement")),/upload rejected/);
  assert.deepEqual(await store.get(key),bytes);
});
test("public buckets fail readiness and refuse new uploads",async()=>{
  const {store,objects}=fixture({public:true});
  assert.equal(await store.ready(),false);
  await assert.rejects(store.put(workspace,artifact,Buffer.from("x")),/not private/);
  assert.equal(objects.size,0);
});
test("invalid object keys and oversized transfers fail without accepting bytes",async()=>{
  const {store,objects}=fixture({max:4});
  await assert.rejects(store.put("../escape",artifact,Buffer.from("x")),/Invalid/);
  await assert.rejects(store.get("../escape"),/Invalid/);
  await assert.rejects(store.put(workspace,artifact,Buffer.from("12345")),/limit/);
  objects.set(key,Buffer.from("12345"));
  await assert.rejects(store.get(key),/limit/);
});
test("legacy reads happen only for missing objects, never upload/auth/server failures",async()=>{
  let reads=0;
  const legacy: MediaStore={maxBytes:1024, ready:async()=>true,put:async()=>{throw Error("unused")},get:async()=>{reads++;return Buffer.from("old video")}};
  assert.equal((await fixture({legacy}).store.get(key)).toString(),"old video");
  assert.equal(reads,1);
  for(const failure of [401,403,500]) {
    const {store}=fixture({legacy,failure});
    await assert.rejects(store.get(key),/unavailable/);
    await assert.rejects(store.put(workspace,artifact,Buffer.from("x")),/upload rejected/);
  }
  assert.equal(reads,1);
});
test("configuration rejects unsafe destinations and local mode remains available",()=>{
  for(const destination of ["http://storagefixture.supabase.co", "https://evil.example", url+"/other", "https://user:password@storagefixture.supabase.co"])
    assert.throws(()=>new SupabaseMediaStore(destination,secret,bucket),/configuration/);
  assert.ok(createMediaStore({MEDIA_STORAGE_PROVIDER:"local"}) instanceof LocalMediaStore);
  assert.throws(()=>createMediaStore({MEDIA_STORAGE_PROVIDER:"invalid"}),/Unknown/);
});
test("network failures are redacted and never write to local storage",async()=>{
  const fetcher: typeof fetch=async()=>{throw Error(secret)};
  const store=new SupabaseMediaStore(url,secret,bucket,1024,undefined,fetcher);
  assert.equal(await store.ready(),false);
  await assert.rejects(store.get(key),error=>error instanceof Error && !error.message.includes(secret));
});
