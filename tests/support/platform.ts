import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import {
  startCluster,
  connectionUrl,
  freePort,
} from "../../scripts/db/local-cluster.mjs";
import { migrate } from "../../scripts/db/migrations.mjs";
import { createRuntimePool } from "../../packages/database/src/client.js";
import { LocalMediaStore } from "../../packages/database/src/media.js";
import {
  createIdentityPool,
  createIdentityService,
} from "../../apps/api/src/modules/identity/service.js";
import { buildApi } from "../../apps/api/src/app.js";
import type { AuthMessage } from "../../apps/api/src/modules/identity/mail.js";
import type { AuthConfig } from "../../apps/api/src/modules/identity/config.js";
export async function platform(browserOrigin = "http://127.0.0.1:3110") {
  const directory = resolve("test-results/platform", randomUUID());
  const local = await startCluster({ directory, port: await freePort() });
  const owner = new pg.Client({
    connectionString: connectionUrl(local.config, "postgres"),
  });
  await owner.connect();
  await owner.query("CREATE DATABASE newbert_test");
  await owner.end();
  const db = new pg.Client({
    connectionString: connectionUrl(local.config, "newbert_test"),
  });
  await db.connect();
  await migrate(db);
  await db.query("GRANT newbert_runtime TO newbert_app");
  const login = async (name: string, role: string) => {
    const password = randomBytes(24).toString("hex");
    await db.query(
      `CREATE ROLE ${pg.escapeIdentifier(name)} LOGIN PASSWORD ${pg.escapeLiteral(password)} NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`,
    );
    await db.query(
      `GRANT ${pg.escapeIdentifier(role)} TO ${pg.escapeIdentifier(name)}`,
    );
    const url = new URL(connectionUrl(local.config, "newbert_test"));
    url.username = name;
    url.password = password;
    return url.href;
  };
  const runtime = createRuntimePool(
    connectionUrl(local.config, "newbert_test", true),
  );
  const worker = createRuntimePool(
    await login("test_worker", "newbert_worker"),
  );
  const authPool = createIdentityPool(
    await login("test_identity", "newbert_identity"),
  );
  const origin = browserOrigin;
  const config: AuthConfig = {
    databaseUrl: "unused",
    secret: randomBytes(32).toString("hex"),
    baseUrl: origin,
    origin,
    production: false,
    mailMode: "local",
  };
  const mail: AuthMessage[] = [];
  const service = createIdentityService(
    authPool,
    config,
    async (m) => {
      mail.push(m);
    },
    1000,
  );
  const media = new LocalMediaStore(resolve(directory, "media"));
  await media.ready();
  const app = buildApi({
    database: runtime,
    identity: { pool: authPool, service, config },
    media,
  });
  await app.ready();
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method: method as "GET" | "POST" | "PATCH",
      url: path,
      headers: {
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { payload: body as Record<string, unknown> }),
    });
  }
  async function user() {
    const email = randomUUID() + "@example.test",
      password = "test-platform-password-2026";
    let r = await call("/api/auth/sign-up/email", "POST", { email, password });
    if (r.statusCode !== 200) throw new Error(r.body);
    const m = mail.findLast((m) => m.to === email)!;
    const u = new URL(m.url);
    await call(u.pathname + u.search);
    r = await call("/api/auth/sign-in/email", "POST", { email, password });
    const sc = r.headers["set-cookie"];
    const cookie = (Array.isArray(sc) ? sc : [sc || ""])
      .map((v) => v.split(";")[0])
      .join("; ");
    const me = (await call("/api/v1/me", "GET", undefined, cookie)).json();
    return {
      cookie,
      email,
      password,
      csrf: me.csrfToken as string,
      workspaceId: me.workspace.id as string,
    };
  }
  async function close() {
    await app.close();
    await Promise.all([runtime.end(), worker.end(), authPool.end()]);
    await db.end();
    await local.cluster.stop();
  }
  return { db, runtime, worker, app, media, call, user, close, origin };
}
export const brief = {
  topic: "Why do people experience the spotlight effect?",
  language: "Hinglish",
  audience: "college",
  mode: "guided",
};
