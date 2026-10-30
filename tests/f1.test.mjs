import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createApp } from '../apps/api/src/app.mjs';
import { readConfig } from '../apps/api/src/config.mjs';

test('F1 config defaults, boundaries and invalid values', () => {
  assert.deepEqual(readConfig({}), { host: '127.0.0.1', port: 3100 });
  for (const port of ['0', '1', '65535']) assert.equal(readConfig({ F1_PORT: port }).port, Number(port));
  for (const port of ['', '-1', '65536', '3.5', 'abc', ' 3100', 'Infinity', '9007199254740993']) {
    assert.throws(() => readConfig({ F1_PORT: port }), /F1_PORT/);
  }
  assert.deepEqual(readConfig({ F1_HOST: 'localhost', F1_PORT: '3200', PORT: '9999', HOST: '0.0.0.0' }), { host: 'localhost', port: 3200 });
});

test('F1 HTTP health, method errors, missing routes and correlation', async t => {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ids = new Set();
  for (const [path, method, status] of [
    ['/health/live', 'GET', 200], ['/health/ready', 'GET', 503],
    ['/health/live?probe=1', 'GET', 200], ['/health/live', 'HEAD', 200],
    ['/health/ready', 'HEAD', 503], ['/api/v1/projects', 'GET', 404],
    ['/health/live/', 'GET', 404], ['/missing', 'HEAD', 404],
    ...['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].flatMap(method =>
      ['/health/live', '/health/ready'].map(path => [path, method, 405]))
  ]) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, status, `${method} ${path}`);
    const requestId = response.headers.get('x-request-id');
    assert.match(requestId, /^[0-9a-f-]{36}$/);
    assert.ok(!ids.has(requestId));
    ids.add(requestId);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (status === 405) assert.equal(response.headers.get('allow'), 'GET, HEAD');
    if (method === 'HEAD') { assert.equal(await response.text(), ''); continue; }
    const body = await response.json();
    if (status === 200) assert.deepEqual(body, { service: 'newbert-api', milestone: 'F1', status: 'alive' });
    if (status === 503) assert.deepEqual(body, { service: 'newbert-api', status: 'not_ready', checks: { database: 'not_connected', mediaStorage: 'not_connected' } });
    if (status === 404 || status === 405) {
      assert.equal(response.headers.get('content-type'), 'application/problem+json');
      assert.equal(body.status, status);
      assert.equal(body.requestId, requestId);
      assert.equal(body.code, status === 404 ? 'NOT_FOUND' : 'METHOD_NOT_ALLOWED');
    }
  }
});

async function runBootstrap(t, env) {
  const child = spawn(process.execPath, ['apps/api/src/main.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, ...env }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    const [code] = await once(child, 'close');
    return { code, output };
  } finally { clearTimeout(timeout); }
}

test('F1 bootstrap rejects invalid port with a nonzero exit', async t => {
  const result = await runBootstrap(t, { F1_PORT: 'invalid' });
  assert.equal(result.code, 1);
  assert.match(result.output, /F1_PORT must be an integer/);
});

test('F1 bootstrap reports occupied ports without an unhandled crash', async t => {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await runBootstrap(t, { F1_HOST: '127.0.0.1', F1_PORT: String(server.address().port) });
  assert.equal(result.code, 1);
  assert.match(result.output, /port is already in use/);
  assert.doesNotMatch(result.output, /Unhandled|GEMINI|ELEVENLABS/);
});

test('F1 startup keeps prototype commands and environment loading separate', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.dev, 'node --env-file-if-exists=.env server.mjs');
  assert.equal(pkg.scripts.start, pkg.scripts.dev);
  assert.equal(pkg.scripts['dev:f1'], 'node --env-file-if-exists=apps/api/.env apps/api/src/main.mjs');
});
