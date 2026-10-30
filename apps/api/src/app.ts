import Fastify from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseState } from '../../../packages/database/src/client.js';
import { registerIdentityRoutes, type IdentityRuntime } from './modules/identity/routes.js';
import { identityDatabaseState } from './modules/identity/service.js';

export function buildApi(options: { database?: pg.Pool; identity?: IdentityRuntime } = {}) {
  const app = Fastify({ logger: false, genReqId: () => randomUUID(), requestTimeout: 10000, bodyLimit: 1024 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id).header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/health/live', async () => ({ service: 'newbert-api', milestone: options.identity ? 'F3' : 'F2', status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    const database = await databaseState(options.database);
    // Media is introduced in F6. DB availability alone is not full readiness.
    return reply.code(503).send({ service: 'newbert-api', status: 'not_ready', checks: { database, mediaStorage: 'not_connected', ...(options.identity ? {identity:await identityDatabaseState(options.identity.pool)} : {}) } });
  });
  if(options.identity && options.database)registerIdentityRoutes(app,options.database,options.identity);
  app.setNotFoundHandler((request, reply) => reply.code(404).type('application/problem+json').send({ type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND', detail: 'This feature is not implemented in the F2 foundation.', requestId: request.id }));
  app.setErrorHandler((error, request, reply) => {
    const candidate = error !== null && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof candidate === 'number' && Number.isInteger(candidate)
      && candidate >= 400 && candidate < 500 ? candidate : 500;
    return reply.code(status).type('application/problem+json').send({
      type: 'about:blank', title: status === 500 ? 'Request failed' : 'Invalid request', status,
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      detail: status === 500 ? 'The request could not be completed.' : 'Check the request format, content type and size.',
      requestId: request.id
    });
  });
  return app;
}
