import {
  mkdir,
  writeFile,
  link,
  unlink,
  readFile,
  realpath,
  lstat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Private local adapter. Keys are generated IDs, never caller filenames or URLs. */
export class LocalMediaStore {
  readonly root: string;
  constructor(
    root = resolve(".local/private-media"),
    readonly maxBytes = 10 * 1024 * 1024,
  ) {
    this.root = resolve(root);
  }
  async ready() {
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      if ((await lstat(this.root)).isSymbolicLink()) return false;
      const probe = join(this.root, ".probe-" + randomUUID());
      await writeFile(probe, "", { flag: "wx", mode: 0o600 });
      await unlink(probe);
      return true;
    } catch {
      return false;
    }
  }
  private async location(key: string, create = false) {
    const parts = key.split("/");
    if (parts.length !== 2 || !parts.every((p) => identifier.test(p)))
      throw new Error("Invalid private object key.");
    if (create) {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      if ((await lstat(this.root)).isSymbolicLink())
        throw new Error("Unsafe private media root.");
    }
    if (create)
      await mkdir(join(this.root, parts[0]!), { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new Error("Unsafe private media root.");
    const root = await realpath(this.root);
    const directory = join(this.root, parts[0]!);
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)) !== join(root, parts[0]!)
    )
      throw new Error("Unsafe private object path.");
    return join(directory, parts[1]!);
  }
  async put(workspaceId: string, artifactId: string, bytes: Buffer) {
    if (bytes.length > this.maxBytes)
      throw new Error("Private object exceeds local limit.");
    const key = workspaceId + "/" + artifactId;
    const target = await this.location(key, true);
    const temp = target + "." + randomUUID() + ".tmp";
    await writeFile(temp, bytes, { flag: "wx", mode: 0o600, flush: true });
    try {
      await link(temp, target);
    } finally {
      await unlink(temp);
    }
    return {
      key,
      byteSize: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    };
  }
  async get(key: string) {
    const target = await this.location(key);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > this.maxBytes)
      throw new Error("Private object unavailable.");
    return readFile(target);
  }
}
