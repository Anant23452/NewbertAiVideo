import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
const testRoot = resolve(import.meta.dirname, '..', 'test-results');
export async function temporaryFolder(t, prefix) {
  await mkdir(testRoot, { recursive: true });
  const dir = await mkdtemp(join(testRoot, prefix));
  t.after(async () => { const rel = relative(testRoot, resolve(dir)); if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Refusing cleanup outside the test workspace'); await rm(dir, { recursive: true, force: true }); });
  return dir;
}
