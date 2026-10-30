import Fastify from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseState } from '../../../packages/database/src/client.js';
import { registerIdentityRoutes, type IdentityRuntime } from './modules/identity/routes.js';
import { identityDatabaseState } from './modules/identity/service.js';
import { registerProjectRoutes } from './modules/projects/routes.js';
import { registerMediaRoutes } from './modules/processing/media-routes.js';
import { LocalMediaStore } from '../../../packages/database/src/media.js';

export function buildApi(options: { database?: pg.Pool; identity?: IdentityRuntime; media?:LocalMediaStore } = {}) {
  const media=options.identity?options.media??new LocalMediaStore():undefined;
  const app = Fastify({ logger: false, ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}, genReqId: () => randomUUID(), requestTimeout: 10000, bodyLimit: 1024 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id).header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/health/live', async () => ({ service: 'newbert-api', milestone: options.identity ? 'F6' : 'F2', status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    const database = await databaseState(options.database);
    let worker=false;try{worker=Boolean((await options.database?.query("SELECT EXISTS(SELECT 1 FROM newbert.worker_heartbeats WHERE online AND last_seen>now()-interval '10 seconds') AS connected"))?.rows[0]?.connected);}catch{}
    const mediaReady=media?await media.ready():false;
    const identity=options.identity?await identityDatabaseState(options.identity.pool):undefined;
    const ready=database==='connected'&&identity==='connected'&&mediaReady&&worker;
    return reply.code(ready?200:503).send({ service: 'newbert-api', status:ready?'ready':'not_ready',checks:{database,mediaStorage:mediaReady?'connected':'not_connected',worker:worker?'connected':'not_connected',...(identity?{identity}:{})} });
  });
  if(options.identity && options.database){registerIdentityRoutes(app,options.database,options.identity);registerProjectRoutes(app,options.database,options.identity);if(media)registerMediaRoutes(app,options.database,options.identity,media);}
  app.setNotFoundHandler((request, reply) => reply.code(404).type('application/problem+json').send({ type: 'about:blank', title: 'Not found', status: 404, code: 'NOT_FOUND', detail: 'This endpoint is not available.', requestId: request.id }));
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
