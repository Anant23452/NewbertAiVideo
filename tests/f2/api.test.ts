import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApi } from '../../apps/api/src/app.js';

test('request errors retain client status codes and redact internal details', async () => {
  const app = buildApi();
  app.post('/probe', async () => { throw new Error('private database credentials'); });
  try {
    for (const [contentType, payload, status] of [
      ['application/json', '{"secret":', 400],
      ['application/octet-stream', 'private payload', 415],
      ['application/json', JSON.stringify({ value: 'x'.repeat(1024 * 1024) }), 413],
      ['application/json', '{}', 500]
    ] as const) {
      const response = await app.inject({ method: 'POST', url: '/probe', headers: { 'content-type': contentType }, payload });
      assert.equal(response.statusCode, status);
      const body = response.json();
      assert.equal(body.status, status);
      assert.equal(body.code, status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST');
      assert.equal(body.requestId, response.headers['x-request-id']);
      assert.equal(response.headers['content-type'], 'application/problem+json; charset=utf-8');
      assert.doesNotMatch(response.body, /private|credentials|SyntaxError|stack/);
    }
  } finally { await app.close(); }
});
