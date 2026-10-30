export function readApiConfig(env = process.env) {
  const port = env.API_PORT ?? '3100';
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error('API_PORT must be an integer from 0 to 65535.');
  const databaseUrl = env.RUNTIME_DATABASE_URL;
  return { host: env.API_HOST || '127.0.0.1', port: Number(port), ...(databaseUrl ? { databaseUrl } : {}) };
}
