import { readdir, lstat, unlink, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import pg from "pg";
import { localConfig, connectionUrl } from "./local-cluster.mjs";

// Dry-run by default. Only aged, unregistered UUID objects below this exact
// private local directory are eligible; registered outputs are never removed.
const root = resolve(".local/private-media");
const apply = process.argv.includes("--apply");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const c = new pg.Client({
  connectionString: connectionUrl(await localConfig()),
});
let candidates = 0,
  removed = 0;
try {
  await c.connect();
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(1793318406)");
  const canonical = await realpath(root);
  if (canonical !== root) throw new Error("Unsafe media root.");
  for (const workspace of await readdir(root)) {
    if (!uuid.test(workspace)) continue;
    const directory = join(root, workspace);
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      continue;
    if (
      (
        await c.query(
          "SELECT 1 FROM newbert.generation_jobs WHERE workspace_id=$1 AND state='running' LIMIT 1",
          [workspace],
        )
      ).rowCount
    )
      continue;
    for (const artifact of await readdir(directory)) {
      if (!uuid.test(artifact)) continue;
      const file = join(directory, artifact),
        stat = await lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        Date.now() - stat.mtimeMs < 86400000
      )
        continue;
      if (
        (
          await c.query(
            "SELECT 1 FROM newbert.artifacts WHERE storage_key=$1",
            [workspace + "/" + artifact],
          )
        ).rowCount
      )
        continue;
      candidates++;
      if (apply) {
        await unlink(file);
        removed++;
      }
    }
  }
  await c.query("COMMIT");
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry_run",
      agedUnregisteredObjects: candidates,
      removed,
      registeredObjectsDeleted: 0,
    }),
  );
} catch (error) {
  await c.query("ROLLBACK").catch(() => {});
  console.error(
    "Private media audit failed or local store is not initialized. Details are redacted.",
  );
  process.exitCode = 1;
} finally {
  await c.end();
}
