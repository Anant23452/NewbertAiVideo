import { buildApi } from "./app.js";
import { readApiConfig } from "./config.js";
import {
  createRuntimePool,
  databaseState,
} from "../../../packages/database/src/client.js";
import { readAuthConfig } from "./modules/identity/config.js";
import {
  createIdentityPool,
  createIdentityService,
  identityDatabaseState,
} from "./modules/identity/service.js";
import { createAuthMailer } from "./modules/identity/mail.js";

try {
  const config = readApiConfig();
  const database = config.databaseUrl
    ? createRuntimePool(config.databaseUrl)
    : undefined;
  const authConfig = readAuthConfig();
  const identityPool = authConfig
    ? createIdentityPool(authConfig.databaseUrl)
    : undefined;
  if (
    identityPool &&
    (await identityDatabaseState(identityPool)) !== "connected"
  ) {
    await identityPool.end();
    await database?.end();
    throw new Error("Identity database role or schema is not ready.");
  }
  if (authConfig && !database) {
    await identityPool?.end();
    throw new Error("Identity requires the tenant runtime database.");
  }
  if (authConfig && (await databaseState(database)) !== "connected") {
    await identityPool?.end();
    await database?.end();
    throw new Error("A safe tenant database is required.");
  }
  const identity =
    authConfig && identityPool
      ? {
          pool: identityPool,
          config: authConfig,
          service: createIdentityService(
            identityPool,
            authConfig,
            createAuthMailer(authConfig),
          ),
        }
      : undefined;
  const app = buildApi({
    ...(database ? { database } : {}),
    ...(identity ? { identity } : {}),
  });
  app.addHook("onClose", async () => {
    await identityPool?.end();
    await database?.end();
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      void app.close();
    });
  await app.listen({ host: config.host, port: config.port });
  console.log(
    `Newbert ${identity ? "F10" : "F2"} API listening on ${config.host}:${app.server.address() && typeof app.server.address() === "object" ? (app.server.address() as { port: number }).port : config.port}.`,
  );
  if (authConfig?.mailMode === "local")
    console.log(
      "Auth mail uses the ignored local development mailbox; no email is sent externally.",
    );
} catch {
  console.error(
    "API startup failed. Check host, port and runtime database configuration; secrets are redacted.",
  );
  process.exitCode = 1;
}
