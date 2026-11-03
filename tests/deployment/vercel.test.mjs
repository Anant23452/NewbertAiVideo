import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function config(values = {}) {
  const env = {...process.env};
  for (const name of ['VERCEL','API_INTERNAL_ORIGIN','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL']) delete env[name];
  Object.assign(env, values);
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    "const {default:c}=await import('./apps/web/next.config.mjs'); console.log(JSON.stringify(await c.rewrites()))"],
    {env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
}
test('Vercel builds the actual app and collects its output from the repository root',()=>{
  const deployment=JSON.parse(readFileSync('vercel.json','utf8'));
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.equal(deployment.buildCommand,'npm run vercel-build');
  assert.equal(pkg.scripts['vercel-build'],'npm run build:web');
  assert.equal(pkg.scripts['build:web'],'next build apps/web');
  assert.equal(deployment.outputDirectory,'apps/web/.next');
});
test('local API stays available; frontend-only Vercel never proxies to localhost',()=>{
  assert.equal(config().beforeFiles[0].destination,'http://127.0.0.1:3100/api/:path*');
  assert.deepEqual(config({VERCEL:'1'}).beforeFiles,[]);
  assert.equal(config({VERCEL:'1',API_INTERNAL_ORIGIN:'https://backend.example/'}).beforeFiles[0].destination,'https://backend.example/api/:path*');
});
test('Vercel rejects loopback, insecure, credential-bearing and self-referencing API origins',()=>{
  for (const api of ['http://127.0.0.1:3100','https://localhost','https://[::1]','https://user:secret@backend.example','https://backend.example/path','https://frontend.vercel.app'])
    assert.throws(()=>config({VERCEL:'1',API_INTERNAL_ORIGIN:api,VERCEL_PROJECT_PRODUCTION_URL:'frontend.vercel.app'}));
});
