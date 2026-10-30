import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';

try {
  const config = readConfig();
  const server = createApp();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'The F1 API port is already in use. Change F1_PORT.' : 'The F1 API could not start. Check its host and port settings.');
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(`Newbert F1 API listening on ${config.host}:${server.address().port}. Dependencies are not connected yet.`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(error => { if (error) process.exitCode = 1; });
    setTimeout(() => { server.closeAllConnections(); }, 5000).unref();
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
