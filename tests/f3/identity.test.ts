import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import pg from 'pg';
// @ts-ignore development tooling module
import { startCluster, freePort, connectionUrl } from '../../scripts/db/local-cluster.mjs';
// @ts-ignore development tooling module
import { migrate } from '../../scripts/db/migrations.mjs';
import { createRuntimePool, withWorkspace } from '../../packages/database/src/client.js';
import { buildApi } from '../../apps/api/src/app.js';
import { createIdentityPool, createIdentityService, identityDatabaseState } from '../../apps/api/src/modules/identity/service.js';
import { createAuthMailer, type AuthMessage } from '../../apps/api/src/modules/identity/mail.js';
import { readAuthConfig, type AuthConfig } from '../../apps/api/src/modules/identity/config.js';

let local: Awaited<ReturnType<typeof startCluster>>;
let owner: pg.Client;let runtime: pg.Pool;let authPool: pg.Pool;
let app: ReturnType<typeof buildApi>;let config: AuthConfig;
let databaseName: string;let roleName: string;
const origin='http://127.0.0.1:3100', password='a-strong-test-password-2026';
const mail: AuthMessage[]=[];const results: string[]=[];
before(async()=>{
  local=await startCluster({directory:resolve('test-results/f3-postgres',randomUUID()),port:await freePort()});
  const suffix=randomUUID().replaceAll('-','');databaseName='newbert_f3_'+suffix;roleName='newbert_auth_'+suffix.slice(0,12);
  const admin=new pg.Client({connectionString:connectionUrl(local.config,'postgres')});await admin.connect();
  const rolePassword=randomBytes(32).toString('hex');
  try{await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(databaseName)}`);await admin.query(`CREATE ROLE ${pg.escapeIdentifier(roleName)} LOGIN PASSWORD ${pg.escapeLiteral(rolePassword)} NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`);}finally{await admin.end();}
  owner=new pg.Client({connectionString:connectionUrl(local.config,databaseName)});await owner.connect();await migrate(owner);
  await owner.query(`GRANT newbert_identity TO ${pg.escapeIdentifier(roleName)}`);await owner.query('GRANT newbert_runtime TO newbert_app');
  runtime=createRuntimePool(connectionUrl(local.config,databaseName,true));
  const authUrl=new URL(connectionUrl(local.config,databaseName));authUrl.username=roleName;authUrl.password=rolePassword;
  config={databaseUrl:authUrl.href,secret:randomBytes(32).toString('hex'),baseUrl:origin,origin,production:false,mailMode:'local'};
  authPool=createIdentityPool(config.databaseUrl);
  const service=createIdentityService(authPool,config,async message=>{mail.push(message);},1000);
  app=buildApi({database:runtime,identity:{service,config,pool:authPool}});await app.ready();
},{timeout:180000});
after(async()=>{
  await app?.close();await authPool?.end();await runtime?.end();await owner?.end();
  if(local){const admin=new pg.Client({connectionString:connectionUrl(local.config,'postgres')});try{await admin.connect();if(databaseName)await admin.query(`DROP DATABASE ${pg.escapeIdentifier(databaseName)}`);if(roleName)await admin.query(`DROP ROLE ${pg.escapeIdentifier(roleName)}`);}finally{await admin.end();await local.cluster.stop();}}
});

async function call(path:string,method='GET',body?:unknown,cookie?:string,headers:Record<string,string>={}) {
  return app.inject({method:method as 'GET'|'POST'|'PATCH',url:path,headers:{origin,...(body!==undefined?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...headers},...(body!==undefined?{payload:body as Record<string,unknown>}:{})});
}
function cookieOf(response:Awaited<ReturnType<typeof call>>){const values=response.headers['set-cookie'];return (Array.isArray(values)?values:values?[values]:[]).map(s=>s.split(';')[0]).join('; ');}
async function register(email:string,verify=true){
  const response=await call('/api/auth/sign-up/email','POST',{email,password});assert.equal(response.statusCode,200,response.body);
  if(verify){const message=mail.findLast(m=>m.to===email&&m.kind==='verification');assert.ok(message);const url=new URL(message.url);const v=await call(url.pathname+url.search);assert.ok([200,302].includes(v.statusCode),v.body);}
  return response;
}
async function login(email:string,value=password){return call('/api/auth/sign-in/email','POST',{email,password:value});}
async function verifiedSession(email:string){await register(email);const response=await login(email);assert.equal(response.statusCode,200,response.body);return cookieOf(response);}

test('registration requires verification and atomically creates one private workspace',async()=>{
  const email='first@example.test';const signup=await register(email,false);assert.equal(signup.json().token,undefined);
  const blocked=await login(email);assert.equal(blocked.statusCode,403);
  const message=mail.find(m=>m.to===email);assert.ok(message);const url=new URL(message.url);
  assert.ok([200,302].includes((await call(url.pathname+url.search)).statusCode));
  const signed=await login(email);assert.equal(signed.statusCode,200,signed.body);assert.equal(signed.json().token,undefined);
  const raw=signed.headers['set-cookie'];const cookies=Array.isArray(raw)?raw.join(';'):raw||'';assert.match(cookies,/HttpOnly/i);assert.match(cookies,/SameSite=Lax/i);
  const me=await call('/api/v1/me','GET',undefined,cookieOf(signed));assert.equal(me.statusCode,200,me.body);assert.match(me.json().csrfToken,/^[a-f0-9]{64}$/);
  const id=me.json().user.id;const workspace=me.json().workspace.id;
  const binding=await owner.query('SELECT * FROM auth.workspace_binding WHERE app_user_id=$1',[id]);assert.equal(binding.rowCount,1);assert.equal(binding.rows[0].workspace_id,workspace);
  assert.equal((await owner.query('SELECT * FROM newbert.workspaces WHERE user_id=$1',[id])).rowCount,1);
  const session=await call('/api/auth/get-session','GET',undefined,cookieOf(signed));assert.equal(session.statusCode,200);assert.equal(session.json().session.token,undefined);
  results.push('Verified sign-in, HttpOnly/Lax cookie, sanitized responses and atomic one-user/one-workspace binding');
});

test('duplicate and concurrent signup cannot allocate duplicate workspaces',async()=>{
  const original=(await owner.query('SELECT count(*)::int AS n FROM newbert.workspaces')).rows[0].n;
  const dup=await call('/api/auth/sign-up/email','POST',{email:'first@example.test',password});assert.equal(dup.statusCode,200,dup.body);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM newbert.workspaces')).rows[0].n,original);
  const responses=await Promise.all([call('/api/auth/sign-up/email','POST',{email:'race@example.test',password}),call('/api/auth/sign-up/email','POST',{email:'race@example.test',password})]);
  assert.ok(responses.some(r=>r.statusCode===200));
  const users=await owner.query('SELECT id FROM auth."user" WHERE email=$1',['race@example.test']);assert.equal(users.rowCount,1);
  assert.equal((await owner.query('SELECT * FROM auth.workspace_binding WHERE auth_user_id=$1',[users.rows[0].id])).rowCount,1);
  results.push('Duplicate and concurrent registration retain exactly one identity/workspace');
});

test('a failed credential insert rolls back user, binding and workspace together',async()=>{
  const beforeCount=(await owner.query('SELECT count(*)::int AS n FROM newbert.workspaces')).rows[0].n;
  await owner.query('ALTER TABLE auth.account ADD CONSTRAINT f3_test_reject_credential CHECK ("providerId" <> \'credential\') NOT VALID');
  const originalError=console.error;const logged:unknown[][]=[];console.error=(...args:unknown[])=>{logged.push(args);};
  try{
    const response=await call('/api/auth/sign-up/email','POST',{email:'rollback@example.test',password});assert.ok(response.statusCode>=400);
    assert.equal((await owner.query('SELECT id FROM auth."user" WHERE email=$1',['rollback@example.test'])).rowCount,0);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM newbert.workspaces')).rows[0].n,beforeCount);
    assert.equal(logged.length,0,'Raw database/auth faults must not be logged');
  }finally{console.error=originalError;await owner.query('ALTER TABLE auth.account DROP CONSTRAINT f3_test_reject_credential');}
  results.push('Injected credential failure leaves no orphan auth user or workspace');
});

test('workspace reads resolve from the session; updates require CSRF and optimistic concurrency',async()=>{
  const one=await verifiedSession('one@example.test'),two=await verifiedSession('two@example.test');
  const first=await call('/api/v1/me','GET',undefined,one),second=await call('/api/v1/me','GET',undefined,two);
  assert.notEqual(first.json().workspace.id,second.json().workspace.id);
  assert.equal((await call('/api/v1/me')).statusCode,401);
  assert.equal((await call('/api/v1/workspace?workspaceId='+first.json().workspace.id,'GET',undefined,two)).json().id,second.json().workspace.id);
  const token=first.json().csrfToken,etag=String(first.headers.etag);
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'UTC'},one,{'if-match':etag})).statusCode,403);
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'UTC'},one,{'if-match':etag,'x-csrf-token':token,origin:'https://evil.example'})).statusCode,403);
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'UTC'},one,{'x-csrf-token':token})).statusCode,428);
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'Not/AZone'},one,{'if-match':etag,'x-csrf-token':token})).statusCode,422);
  const saved=await call('/api/v1/workspace','PATCH',{timezone:'UTC'},one,{'if-match':etag,'x-csrf-token':token});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().timezone,'UTC');
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'Asia/Kolkata'},one,{'if-match':etag,'x-csrf-token':token})).statusCode,412);
  assert.equal((await call('/api/v1/workspace','GET',undefined,two)).json().timezone,'Asia/Kolkata');
  await assert.rejects(runtime.query('SELECT * FROM auth."user"'),/permission denied/);
  await assert.rejects(runtime.query('SELECT * FROM newbert.resolve_identity($1)',['anything']),/permission denied/);
  await assert.rejects(authPool.query('SELECT * FROM newbert.projects'),/permission denied/);
  const r=await withWorkspace(runtime,first.json().workspace.id,async client=>client.query('SELECT id FROM newbert.workspaces WHERE id=$1',[second.json().workspace.id]));assert.equal(r.rowCount,0);
  results.push('Session-derived tenant, isolated roles, CSRF/Origin, IANA validation and stale-edit rejection');
});

test('sign-out and revoke-all require session CSRF and invalidate server-side sessions',async()=>{
  const cookie=await verifiedSession('logout@example.test');const me=await call('/api/v1/me','GET',undefined,cookie);
  assert.equal((await call('/api/auth/sign-out','POST',{},cookie)).statusCode,403);
  assert.equal((await call('/api/auth/sign-out','POST',{},cookie,{'x-csrf-token':me.json().csrfToken,origin:'https://evil.example'})).statusCode,403);
  const out=await call('/api/auth/sign-out','POST',{},cookie,{'x-csrf-token':me.json().csrfToken});assert.equal(out.statusCode,200,out.body);
  assert.equal((await call('/api/v1/me','GET',undefined,cookie)).statusCode,401);
  const a=await login('logout@example.test'),b=await login('logout@example.test');
  const fresh=await call('/api/v1/me','GET',undefined,cookieOf(a));
  assert.equal((await call('/api/auth/revoke-sessions','POST',{},cookieOf(a),{'x-csrf-token':fresh.json().csrfToken})).statusCode,200);
  assert.equal((await call('/api/v1/me','GET',undefined,cookieOf(b))).statusCode,401);
  results.push('Logout/revoke-all validate CSRF and reject revoked cookies without cookie caching');
});

test('password recovery is non-enumerating, rejects weak/reused tokens and revokes old sessions',async()=>{
  const email='reset@example.test';const cookie=await verifiedSession(email);
  const request=await call('/api/auth/request-password-reset','POST',{email,redirectTo:origin+'/reset-password'});assert.equal(request.statusCode,200,request.body);
  const absent=await call('/api/auth/request-password-reset','POST',{email:'absent@example.test',redirectTo:origin+'/reset-password'});assert.equal(absent.statusCode,request.statusCode);assert.deepEqual(absent.json(),request.json());
  const message=mail.findLast(m=>m.to===email&&m.kind==='password_reset');assert.ok(message);
  const url=new URL(message.url),token=url.searchParams.get('token')||url.pathname.split('/').pop();assert.ok(token);
  assert.equal((await call('/api/auth/reset-password','POST',{token,newPassword:'short'})).statusCode,400);
  const changed=password+'-new';const response=await call('/api/auth/reset-password','POST',{token,newPassword:changed});assert.equal(response.statusCode,200,response.body);
  assert.equal((await call('/api/v1/me','GET',undefined,cookie)).statusCode,401);
  assert.equal((await login(email)).statusCode,401);assert.equal((await login(email,changed)).statusCode,200);
  assert.ok((await call('/api/auth/reset-password','POST',{token,newPassword:password+'-again'})).statusCode>=400);
  results.push('Recovery responses do not reveal account presence; reset tokens are single use and old sessions revoked');
});

test('session refresh is read-only on GET and requires CSRF on POST',async()=>{
  const email='refresh@example.test',cookie=await verifiedSession(email);
  await owner.query('UPDATE auth.session SET "expiresAt"=now()+interval \'1 hour\',"updatedAt"=now()-interval \'2 days\' WHERE "userId"=(SELECT id FROM auth."user" WHERE email=$1)',[email]);
  const before=(await owner.query('SELECT "expiresAt" FROM auth.session WHERE "userId"=(SELECT id FROM auth."user" WHERE email=$1)',[email])).rows[0].expiresAt;
  const get=await call('/api/auth/get-session','GET',undefined,cookie);assert.equal(get.statusCode,200,get.body);assert.equal(get.json().needsRefresh,true);
  assert.equal((await owner.query('SELECT "expiresAt" FROM auth.session WHERE "userId"=(SELECT id FROM auth."user" WHERE email=$1)',[email])).rows[0].expiresAt.toISOString(),before.toISOString());
  assert.equal((await call('/api/auth/get-session','POST',{},cookie)).statusCode,403);
  const me=await call('/api/v1/me','GET',undefined,cookie);
  const refreshed=await call('/api/auth/get-session','POST',{},cookie,{'x-csrf-token':me.json().csrfToken});assert.equal(refreshed.statusCode,200,refreshed.body);
  assert.ok((await owner.query('SELECT "expiresAt" FROM auth.session WHERE "userId"=(SELECT id FROM auth."user" WHERE email=$1)',[email])).rows[0].expiresAt.getTime()>before.getTime());
  results.push('Read-only GET sessions and explicit CSRF-protected POST refresh verified');
});

test('expired sessions, disabled accounts and tampered verification links cannot gain access',async()=>{
  const cookie=await verifiedSession('disabled@example.test');const me=await call('/api/v1/me','GET',undefined,cookie);
  await owner.query('UPDATE newbert.app_users SET status=$1 WHERE id=$2',['disabled',me.json().user.id]);
  assert.equal((await call('/api/v1/me','GET',undefined,cookie)).statusCode,403);
  assert.notEqual((await login('disabled@example.test')).statusCode,200);
  const allowedLogout=await call('/api/auth/sign-out','POST',{},cookie,{'x-csrf-token':me.json().csrfToken});assert.equal(allowedLogout.statusCode,200,allowedLogout.body);
  const expired=await verifiedSession('expired@example.test');
  await owner.query('UPDATE auth.session SET "expiresAt"=now()-interval \'1 minute\' WHERE "userId"=(SELECT id FROM auth."user" WHERE email=$1)',['expired@example.test']);
  assert.equal((await call('/api/v1/me','GET',undefined,expired)).statusCode,401);
  const invalid=await call('/api/auth/verify-email?token=invalid');assert.ok(invalid.statusCode>=400||invalid.statusCode===302);
  results.push('Disabled identities, expired sessions and invalid verification tokens are blocked');
});

test('password changes require the current password and revoke other sessions',async()=>{
  const email='change@example.test',a=await verifiedSession(email),b=cookieOf(await login(email));
  const me=await call('/api/v1/me','GET',undefined,a);const csrf=me.json().csrfToken;
  assert.ok((await call('/api/auth/change-password','POST',{currentPassword:'incorrect-password',newPassword:password+'-changed'},a,{'x-csrf-token':csrf})).statusCode>=400);
  const response=await call('/api/auth/change-password','POST',{currentPassword:password,newPassword:password+'-changed',revokeOtherSessions:false},a,{'x-csrf-token':csrf});assert.equal(response.statusCode,200,response.body);
  assert.equal((await call('/api/v1/me','GET',undefined,b)).statusCode,401);
  assert.equal((await login(email)).statusCode,401);assert.equal((await login(email,password+'-changed')).statusCode,200);
  results.push('Current-password validation and mandatory other-session revocation on password changes');
});

test('expired reset links and tampered verification tokens remain unusable',async()=>{
  const email='expired-reset@example.test';await verifiedSession(email);
  await call('/api/auth/request-password-reset','POST',{email,redirectTo:origin+'/reset-password'});
  const message=mail.findLast(m=>m.to===email&&m.kind==='password_reset');assert.ok(message);const url=new URL(message.url);const token=url.searchParams.get('token')||url.pathname.split('/').pop();
  await owner.query('UPDATE auth.verification SET "expiresAt"=now()-interval \'1 minute\'');
  assert.ok((await call('/api/auth/reset-password','POST',{token,newPassword:password+'-new'})).statusCode>=400);
  assert.equal((await login(email)).statusCode,200);
  await register('tampered@example.test',false);
  const verify=mail.findLast(m=>m.to==='tampered@example.test'&&m.kind==='verification');assert.ok(verify);const tampered=new URL(verify.url);tampered.searchParams.set('token',tampered.searchParams.get('token')+'broken');
  await call(tampered.pathname+tampered.search);
  assert.equal((await owner.query('SELECT "emailVerified" FROM auth."user" WHERE email=$1',['tampered@example.test'])).rows[0].emailVerified,false);
  assert.equal((await login('tampered@example.test')).statusCode,403);
  results.push('Expired reset tokens and tampered verification links cannot change credentials or verification');
});

test('untrusted origins, redirects and malformed requests fail without leaking secrets',async()=>{
  assert.equal((await call('/api/auth/sign-up/email','POST',{email:'csrf@example.test',password},undefined,{origin:'https://evil.example'})).statusCode,403);
  const redirect=await call('/api/auth/request-password-reset','POST',{email:'first@example.test',redirectTo:'https://evil.example/reset'});assert.equal(redirect.statusCode,403,redirect.body);
  const malformed=await app.inject({method:'POST',url:'/api/auth/sign-in/email',headers:{origin,'content-type':'application/json'},payload:'{broken'});assert.equal(malformed.statusCode,400);assert.doesNotMatch(malformed.body,/postgres|password|SELECT|stack|connectionString/i);
  assert.equal((await call('/api/auth/delete-user','POST',{})).statusCode,404);
  results.push('Foreign origins/redirects rejected; malformed requests sanitized and unsupported account operations unavailable');
});

test('default auth rate limiting is persisted and returns a bounded retry response',async()=>{
  const service=createIdentityService(authPool,config,async()=>{});
  const limited=buildApi({database:runtime,identity:{service,config,pool:authPool}});
  try{
    let last;
    for(let i=0;i<6;i++)last=await limited.inject({method:'POST',url:'/api/auth/sign-in/email',remoteAddress:'198.51.100.22',headers:{origin,'content-type':'application/json'},payload:{email:'missing@example.test',password}});
    assert.equal(last!.statusCode,429,last!.body);assert.ok(last!.headers['retry-after']);
    assert.ok((await owner.query('SELECT id FROM auth."rateLimit"')).rowCount!>0);
  }finally{await limited.close();}
  results.push('Database-backed auth throttling returns 429 and Retry-After');
});

test('CSRF tokens cannot cross sessions and ownership fields cannot change workspace access',async()=>{
  const a=await verifiedSession('qa-session-a@example.test'),b=await verifiedSession('qa-session-b@example.test');
  const one=await call('/api/v1/me','GET',undefined,a),two=await call('/api/v1/me','GET',undefined,b);
  const headers={'if-match':String(two.headers.etag),'x-csrf-token':one.json().csrfToken};
  assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'UTC'},b,headers)).statusCode,403);
  assert.equal((await call('/api/auth/revoke-sessions','POST',{},b,{'x-csrf-token':one.json().csrfToken})).statusCode,403);
  const ownHeaders={'if-match':String(two.headers.etag),'x-csrf-token':two.json().csrfToken};
  for(const field of ['id','userId','workspaceId','revision']){
    assert.equal((await call('/api/v1/workspace','PATCH',{timezone:'UTC',[field]:one.json().workspace.id},b,ownHeaders)).statusCode,422);
  }
  assert.equal((await call('/api/v1/workspace','GET',undefined,b)).json().timezone,two.json().workspace.timezone);
  assert.equal((await call('/api/v1/me','GET',undefined,a)).statusCode,200);
  assert.equal((await call('/api/v1/me','GET',undefined,b)).statusCode,200);
  results.push('Independent QA: cross-session CSRF replay and workspace ownership/revision injection rejected');
});

test('forged proxy headers cannot change trusted verification URLs or bypass sign-in throttling',async()=>{
  const email='qa-host@example.test';
  const spoof={host:'evil.example',forwarded:'for=198.51.100.42;host=evil.example;proto=https','x-forwarded-host':'evil.example','x-forwarded-proto':'https','x-real-ip':'198.51.100.42'};
  const signup=await call('/api/auth/sign-up/email','POST',{email,password},undefined,spoof);
  assert.equal(signup.statusCode,200,signup.body);
  const message=mail.findLast(m=>m.to===email&&m.kind==='verification');assert.ok(message);
  assert.equal(new URL(message.url).origin,origin);
  const service=createIdentityService(authPool,config,async()=>{});
  const limited=buildApi({database:runtime,identity:{service,config,pool:authPool}});
  try{
    let last;
    for(let i=0;i<6;i++)last=await limited.inject({method:'POST',url:'/api/auth/sign-in/email',remoteAddress:'198.51.100.81',headers:{origin,'content-type':'application/json','x-real-ip':`203.0.113.${i+1}`,'x-forwarded-for':`203.0.113.${i+1}`},payload:{email:'qa-missing@example.test',password}});
    assert.equal(last!.statusCode,429,last!.body);
  }finally{await limited.close();}
  results.push('Independent QA: hostile Host/proxy headers cannot poison mail links or rotate the rate-limit identity');
});

test('production configuration fails closed and local mail stays off the public API',async()=>{
  assert.equal(readAuthConfig({}),undefined);
  assert.throws(()=>readAuthConfig({NODE_ENV:'production'}));
  assert.throws(()=>readAuthConfig({AUTH_DATABASE_URL:'postgres://x',BETTER_AUTH_SECRET:'short'}));
  assert.throws(()=>readAuthConfig({AUTH_DATABASE_URL:'postgres://x',BETTER_AUTH_SECRET:'x'.repeat(40),NODE_ENV:'production',AUTH_BASE_URL:'http://127.0.0.1:3100'}));
  assert.throws(()=>readAuthConfig({AUTH_DATABASE_URL:'postgres://x',BETTER_AUTH_SECRET:'x'.repeat(40),AUTH_BASE_URL:'https://public.example',AUTH_MAIL_MODE:'local'}));
  const secureConfig={...config,baseUrl:'https://secure.example',origin:'https://secure.example',production:true};
  const secureService=createIdentityService(authPool,secureConfig,async()=>{},1000);
  const response=await secureService.handler(new Request('https://secure.example/api/auth/sign-in/email',{method:'POST',headers:{origin:secureConfig.origin,'content-type':'application/json'},body:JSON.stringify({email:'first@example.test',password})}));
  assert.equal(response.status,200);assert.match(response.headers.getSetCookie().join(';'),/Secure/i);
  assert.equal(await identityDatabaseState(authPool),'connected');
  const ownerPool=createIdentityPool(connectionUrl(local.config,databaseName));try{assert.equal(await identityDatabaseState(ownerPool),'unsafe_role');}finally{await ownerPool.end();}
  assert.equal((await call('/api/v1/auth-mailbox')).statusCode,404);
  const delivery=createAuthMailer(config);await delivery({kind:'verification',to:'delivery@example.test',url:origin+'/example-test-link'});
  results.push('HTTPS cookies, fail-closed production configuration, isolated auth credentials and local-only development delivery');
  await mkdir('docs/db',{recursive:true});await writeFile('docs/db/f3-validation-results.json',JSON.stringify({date:'2026-10-30',engine:'Native PostgreSQL and Fastify/Better Auth HTTP integration',delivery:'In-memory test mail and local-file sink only; no external email sent',results},null,2)+'\n');
});
