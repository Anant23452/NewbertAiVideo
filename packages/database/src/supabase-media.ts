import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { LocalMediaStore, type MediaStore } from "./media.js";

const objectKey = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Backend-only adapter. New objects are immutable; missing legacy objects may read locally. */
export class SupabaseMediaStore implements MediaStore {
  private readonly origin: string;
  private readonly headers: Record<string, string>;
  constructor(
    url: string,
    key: string,
    private readonly bucket: string,
    readonly maxBytes = 10 * 1024 * 1024,
    private readonly legacy?: MediaStore,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password ||
        target.pathname !== "/" || target.search || target.hash ||
        !/^[a-z0-9]+\.supabase\.co$/.test(target.hostname) ||
        !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(bucket) ||
        !(key.startsWith("sb_secret_") || key.startsWith("eyJ")))
      throw new Error("Invalid server storage configuration.");
    this.origin = target.origin;
    this.headers = { apikey: key };
    if (key.startsWith("eyJ")) this.headers.Authorization = "Bearer " + key;
  }
  private async request(path: string, init: RequestInit = {}) {
    try {
      return await this.fetcher(this.origin + "/storage/v1/" + path, {
        ...init, headers: { ...this.headers, ...init.headers },
        redirect: "error", signal: AbortSignal.timeout(30000),
      });
    } catch { throw new Error("Private storage request unavailable."); }
  }
  private async bounded(response: Response, limit: number) {
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel(); throw new Error("Private object exceeds storage limit.");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error("Private object exceeds storage limit."); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  async ready() {
    try {
      const response = await this.request("bucket/" + this.bucket);
      if (!response.ok) { await response.body?.cancel(); return false; }
      const info = JSON.parse((await this.bounded(response, 16384)).toString());
      return info.id === this.bucket && info.public === false;
    } catch { return false; }
  }
  async put(workspaceId: string, artifactId: string, bytes: Buffer) {
    const key = workspaceId + "/" + artifactId;
    if (!objectKey.test(key)) throw new Error("Invalid private object key.");
    if (bytes.length > this.maxBytes) throw new Error("Private object exceeds storage limit.");
    if (!(await this.ready())) throw new Error("Private storage is unavailable or not private.");
    const response = await this.request("object/" + this.bucket + "/" + key, {
      method: "POST", headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" },
      body: new Uint8Array(bytes),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("Private object upload rejected.");
    return {key, byteSize: bytes.length, contentHash: createHash("sha256").update(bytes).digest("hex")};
  }
  async get(key: string) {
    if (!objectKey.test(key)) throw new Error("Invalid private object key.");
    const response = await this.request("object/authenticated/" + this.bucket + "/" + key);
    if (response.ok) return this.bounded(response, this.maxBytes);
    let missing = response.status === 404;
    // Storage also wraps a missing-object 404 in an HTTP 400 response.
    if (response.status === 400) {
      try { missing = String(JSON.parse((await this.bounded(response, 16384)).toString()).statusCode) === "404"; }
      catch { missing = false; }
    } else await response.body?.cancel();
    if (missing && this.legacy) return this.legacy.get(key);
    throw new Error("Private object unavailable.");
  }
}

export function createMediaStore(env = process.env): MediaStore {
  let local: Record<string, string | undefined> = {};
  try { local = parseEnv(readFileSync(".env", "utf8")); } catch {}
  const setting = (name: string) => (env[name] ?? local[name] ?? "").trim();
  const provider = setting("MEDIA_STORAGE_PROVIDER") || "local";
  if (provider === "local") return new LocalMediaStore();
  if (provider !== "supabase") throw new Error("Unknown private storage provider.");
  return new SupabaseMediaStore(setting("SUPABASE_URL"), setting("SUPABASE_SECRET_KEY"),
    setting("SUPABASE_STORAGE_BUCKET"), 10 * 1024 * 1024, new LocalMediaStore());
}
