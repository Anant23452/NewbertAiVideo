import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createRuntimePool } from "../../../packages/database/src/client.js";
import { createMediaStore } from "../../../packages/database/src/supabase-media.js";
import { runPlanning } from "../../api/src/modules/planning/runner.js";
import {runProduction} from '../../api/src/modules/production/runner.js';
import {
  claimNext,
  finish,
  recoverExpired,
} from "../../api/src/modules/processing/queue.js";

const url = process.env.WORKER_DATABASE_URL;
if (!url)
  throw new Error(
    "Configure a restricted worker database login with worker:setup.",
  );
const pool = createRuntimePool(url);
const media = createMediaStore();
const owner = "worker-" + randomUUID();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopping = true;
  });
try {
  const role = (
    await pool.query(`SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication AS unsafe,
    pg_has_role(current_user,'newbert_worker','member') AS worker,
    pg_has_role(current_user,'newbert_identity','member') AS identity FROM pg_roles WHERE rolname=current_user`)
  ).rows[0];
  if (!role?.worker || role.unsafe || role.identity)
    throw new Error("Unsafe worker role.");
  if (!(await media.ready()))
    throw new Error("Private media store unavailable.");
  console.log(
    "Newbert F10 worker ready. Planning, narration and validated video processing are bounded.",
  );
  while (!stopping) {
    try {
      await pool.query(
        "INSERT INTO newbert.worker_heartbeats(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET last_seen=now(),online=true",
        [owner],
      );
      await recoverExpired(pool);
      const lease = await claimNext(pool, owner);
      if (lease) {
        // F7–F10 register actual stage handlers. Never invent a successful output or
        // call the feasibility prototype from the durable production worker.
        if (!stopping && ["plan", "ideation"].includes(lease.kind))
          await runPlanning(pool, lease, media);
        else if(!stopping&&lease.kind==='produce')await runProduction(pool,lease,media);
        else
          await finish(
            pool,
            lease,
            "paused",
            stopping ? "WORKER_SHUTDOWN" : "PIPELINE_NOT_READY",
          );
      } else await delay(1000);
    } catch {
      console.error(
        "Worker cycle failed; durable jobs remain recoverable. Details are redacted.",
      );
      await delay(1000);
    }
  }
} catch {
  console.error(
    "Worker startup failed. Check restricted role, migrations and private media.",
  );
  process.exitCode = 1;
} finally {
  await pool
    .query("UPDATE newbert.worker_heartbeats SET online=false WHERE id=$1", [
      owner,
    ])
    .catch(() => {});
  await pool.end();
}
