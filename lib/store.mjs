import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(root = resolve('.data')) { this.root = root; this.file = resolve(root, 'store.json'); this.tail = Promise.resolve(); }
  async init() {
    await mkdir(this.root, { recursive: true });
    try { this.data = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.data = { users: [], sessions: [], projects: [], jobs: [] }; await this.save(); }
  }
  async save() { const tmp = this.file + '.tmp'; await writeFile(tmp, JSON.stringify(this.data, null, 2)); await rename(tmp, this.file); }
  update(fn) {
    const next = this.tail.then(async () => {
      const before = structuredClone(this.data);
      try { const result = await fn(this.data); await this.save(); return structuredClone(result); }
      catch (error) { this.data = before; throw error; }
    });
    this.tail = next.catch(() => {}); return next;
  }
  id() { return randomUUID(); }
}
