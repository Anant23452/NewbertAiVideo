import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { fromNodeHeaders } from 'better-auth/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { withWorkspace } from '../../../../../packages/database/src/client.js';
import type { AuthConfig } from './config.js';
import type { IdentityService } from './service.js';

export interface IdentityRuntime { service: IdentityService; config: AuthConfig; pool: pg.Pool }
type DomainIdentity = { user_id: string; workspace_id: string; status: string };
function problem(reply: FastifyReply, request: FastifyRequest, status: number, code: string, detail: string) {
  return reply.code(status).type('application/problem+json').send({ type: 'about:blank', title: code.replaceAll('_',' '), status, code, detail, requestId: request.id });
}
function csrf(secret: string, sessionId: string) { return createHmac('sha256',secret).update('newbert:csrf:'+sessionId).digest('hex'); }
export function csrfMatches(expected: string, supplied: unknown) {
  return typeof supplied==='string' && /^[0-9a-f]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(expected),Buffer.from(supplied));
}
export async function current(request: FastifyRequest, reply: FastifyReply, identity: IdentityRuntime, allowDisabled = false) {
  const session = await identity.service.api.getSession({ headers: fromNodeHeaders(request.headers), query: { disableCookieCache: true } });
  if (!session) { problem(reply,request,401,'AUTHENTICATION_REQUIRED','Sign in to your workspace.');return; }
  if (!session.user.emailVerified) { problem(reply,request,403,'EMAIL_NOT_VERIFIED','Verify your email before using your workspace.');return; }
  const result = await identity.pool.query<DomainIdentity>('SELECT * FROM newbert.resolve_identity($1)',[session.user.id]);
  const domain = result.rows[0];
  if (!domain || (domain.status!=='active' && !allowDisabled)) { problem(reply,request,403,'ACCOUNT_DISABLED','This account cannot access the workspace.');return; }
  return { domain, session, csrfToken: csrf(identity.config.secret,session.session.id) };
}
const authPaths = new Set(['/sign-up/email','/sign-in/email','/sign-out','/get-session','/send-verification-email','/verify-email','/request-password-reset','/reset-password','/change-password','/revoke-sessions']);
const protectedAuthPaths = new Set(['/sign-out','/change-password','/revoke-sessions','/get-session']);

export function registerIdentityRoutes(app: FastifyInstance, database: pg.Pool, identity: IdentityRuntime) {
  app.route({ method: ['GET','POST'], url: '/api/auth/*', handler: async (request,reply) => {
    const path = new URL(request.url,identity.config.baseUrl).pathname.slice('/api/auth'.length);
    if (!authPaths.has(path) && !(request.method==='GET' && /^\/reset-password\/[^/]+$/.test(path))) return problem(reply,request,404,'NOT_FOUND','This identity action is not available.');
    if (request.method==='POST') {
      if (request.headers.origin!==identity.config.origin) return problem(reply,request,403,'CSRF_REJECTED','Use the trusted application origin.');
      if (!request.headers['content-type']?.startsWith('application/json')) return problem(reply,request,415,'JSON_REQUIRED','Send authentication requests as JSON.');
      if (protectedAuthPaths.has(path)) {
        const auth = await current(request,reply,identity,path==='/sign-out');if(!auth)return;
        if(!csrfMatches(auth.csrfToken,request.headers['x-csrf-token']))return problem(reply,request,403,'CSRF_REJECTED','Refresh your session and retry this action.');
      }
    }
    if(path==='/get-session' && !(await current(request,reply,identity)))return;
    const headers=fromNodeHeaders(request.headers);
    headers.delete('host');headers.delete('content-length');headers.delete('forwarded');headers.delete('x-forwarded-for');headers.delete('x-forwarded-host');headers.delete('x-forwarded-proto');
    headers.set('x-real-ip',request.ip);
    let body=request.body;
    if(path==='/sign-up/email' && body && typeof body==='object') body={...body,name: typeof (body as {name?:unknown}).name==='string'?(body as {name:string}).name:'Creator'};
    if(path==='/change-password' && body && typeof body==='object')body={...body,revokeOtherSessions:true};
    let response: Response;
    try{response=await identity.service.handler(new Request(new URL(request.url,identity.config.baseUrl),{method:request.method,headers,...(request.method==='POST'?{body:JSON.stringify(body||{})}:{})}));}
    catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='28000')return problem(reply,request,403,'ACCOUNT_DISABLED','This account cannot start a session.');throw error;}
    for(const[key,value]of response.headers)if(!['set-cookie','content-length','cache-control'].includes(key))reply.header(key,value);
    const cookies=response.headers.getSetCookie();if(cookies.length)reply.header('set-cookie',cookies);
    if(response.status===429){const seconds=Number(response.headers.get('x-retry-after'));reply.header('Retry-After',String(Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds):60));}
    reply.code(response.status);
    const text=await response.text();
    if(response.headers.get('content-type')?.includes('application/json') && text){
      const value=JSON.parse(text);
      // The browser uses HttpOnly cookies, not JSON bearer/session tokens.
      if(value&&typeof value==='object'){delete value.token;if(value.session)delete value.session.token;}
      return reply.send(value);
    }
    return reply.send(text||null);
  } });

  async function readWorkspace(request: FastifyRequest, reply: FastifyReply, me: boolean) {
    const auth=await current(request,reply,identity);if(!auth)return;
    const row=await withWorkspace(database,auth.domain.workspace_id,async client=>(await client.query('SELECT id,revision,timezone,created_at FROM newbert.workspaces WHERE id=$1',[auth.domain.workspace_id])).rows[0]);
    if(!row)return problem(reply,request,404,'NOT_FOUND','Workspace not found.');
    const workspace={id:row.id,revision:Number(row.revision),timezone:row.timezone,createdAt:row.created_at};
    reply.header('ETag',`"workspace:${workspace.id}:${workspace.revision}"`);
    return me?{user:{id:auth.domain.user_id,status:auth.domain.status},workspace,csrfToken:auth.csrfToken}:workspace;
  }
  app.get('/api/v1/me',(request,reply)=>readWorkspace(request,reply,true));
  app.get('/api/v1/workspace',(request,reply)=>readWorkspace(request,reply,false));
  app.patch('/api/v1/workspace',async(request,reply)=>{
    const auth=await current(request,reply,identity);if(!auth)return;
    if(request.headers.origin!==identity.config.origin || !csrfMatches(auth.csrfToken,request.headers['x-csrf-token']))return problem(reply,request,403,'CSRF_REJECTED','Refresh your session and use the trusted origin.');
    if(!request.headers['if-match'])return problem(reply,request,428,'PRECONDITION_REQUIRED','Read the current workspace before changing it.');
    const body=request.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='timezone')||typeof (body as {timezone?:unknown}).timezone!=='string')return problem(reply,request,422,'INVALID_TIMEZONE','Provide only an IANA timezone.');
    const timezone=(body as {timezone:string}).timezone;
    try{if(timezone.length>80)throw new Error();new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{return problem(reply,request,422,'INVALID_TIMEZONE','Choose a supported IANA timezone.');}
    const match=request.headers['if-match'].match(/^"workspace:([0-9a-f-]+):([1-9]\d*)"$/);
    if(!match||match[1]!==auth.domain.workspace_id)return problem(reply,request,412,'STALE_REVISION','Refresh the workspace and retry.');
    const result=await withWorkspace(database,auth.domain.workspace_id,async client=>client.query('UPDATE newbert.workspaces SET timezone=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING id,revision,timezone,created_at',[timezone,auth.domain.workspace_id,match[2]]));
    const row=result.rows[0];if(!row)return problem(reply,request,412,'STALE_REVISION','Another change was saved first. Refresh and retry.');
    const workspace={id:row.id,revision:Number(row.revision),timezone:row.timezone,createdAt:row.created_at};
    return reply.header('ETag',`"workspace:${workspace.id}:${workspace.revision}"`).send(workspace);
  });
}
