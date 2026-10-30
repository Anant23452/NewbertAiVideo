export function readConfig(env = process.env) {
  const raw = env.F1_PORT ?? '3100';
  if (!/^\d+$/.test(raw)) throw new Error('F1_PORT must be an integer from 0 to 65535.');
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port > 65535) throw new Error('F1_PORT must be an integer from 0 to 65535.');
  return { host: env.F1_HOST || '127.0.0.1', port };
}
