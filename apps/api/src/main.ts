import { buildApi } from './app.js';
import { readApiConfig } from './config.js';
import { createRuntimePool } from '../../../packages/database/src/client.js';

try {
  const config = readApiConfig();
  const database = config.databaseUrl ? createRuntimePool(config.databaseUrl) : undefined;
  const app = buildApi(database ? { database } : {});
  app.addHook('onClose', async () => { await database?.end(); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close(); });
  await app.listen({ host: config.host, port: config.port });
  console.log(`Newbert F2 API listening on ${config.host}:${app.server.address() && typeof app.server.address() === 'object' ? (app.server.address() as {port:number}).port : config.port}.`);
} catch {
  console.error('API startup failed. Check host, port and runtime database configuration; secrets are redacted.');
  process.exitCode = 1;
}
