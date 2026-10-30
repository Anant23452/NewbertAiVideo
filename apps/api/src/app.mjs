import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// F1 starts only the HTTP boundary. No prototype store, keys or workers are loaded.
export function createApp() {
  return createServer((request, response) => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    function send(status, body, problem = false) {
      response.writeHead(status, { 'Content-Type': problem ? 'application/problem+json' : 'application/json' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(body));
    }
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; }
    catch { return send(400, { type: 'about:blank', title: 'Invalid request', status: 400, code: 'INVALID_REQUEST', detail: 'Use a valid request URL.', requestId }, true); }
    const health = path === '/health/live' || path === '/health/ready';
    if (health && !['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return send(405, { type: 'about:blank', title: 'Method not allowed', status: 405, code: 'METHOD_NOT_ALLOWED', detail: 'Health endpoints accept GET or HEAD.', requestId }, true);
    }
    if (path === '/health/live') return send(200, { service: 'newbert-api', milestone: 'F1', status: 'alive' });
    if (path === '/health/ready') return send(503, {
      service: 'newbert-api', status: 'not_ready',
      checks: { database: 'not_connected', mediaStorage: 'not_connected' }
    });
    return send(404, { type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND', detail: 'This route is not available in the F1 foundation.', requestId }, true);
  });
}
