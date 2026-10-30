import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import pg from 'pg';
// Local development tools are JavaScript; application boundaries remain typed.
// @ts-ignore tool module has no public declaration surface.
import { startCluster, freePort, connectionUrl } from '../../scripts/db/local-cluster.mjs';
// @ts-ignore tool module has no public declaration surface.
import { migrate, migrationDirectory } from '../../scripts/db/migrations.mjs';
import { createRuntimePool, databaseState, withWorkspace } from '../../packages/database/src/client.js';
import { buildApi } from '../../apps/api/src/app.js';
import { readApiConfig } from '../../apps/api/src/config.js';

let local: Awaited<ReturnType<typeof startCluster>>;
let owner: pg.Client;
let runtime: pg.Pool;
let databaseName: string;
const results: string[] = [];
const u1=randomUUID(),u2=randomUUID(),w1=randomUUID(),w2=randomUUID(),p1=randomUUID(),p2=randomUUID(),v1=randomUUID();
const hash='a'.repeat(64);
const expectedMigrations=(await readdir(migrationDirectory)).filter((name:string)=>name.endsWith('.sql')).length;
before(async()=>{
  local=await startCluster({directory:resolve('test-results/f2-postgres'),port:await freePort()});
  databaseName='newbert_f2_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:connectionUrl(local.config,'postgres')});
  await admin.connect();try{await admin.query(`CREATE DATABASE ${pg.escapeIdentifier(databaseName)}`);}finally{await admin.end();}
  owner=new pg.Client({connectionString:connectionUrl(local.config,databaseName)});await owner.connect();
}, {timeout:180000});

after(async()=>{
  await runtime?.end();await owner?.end();
  if(local){
    const admin=new pg.Client({connectionString:connectionUrl(local.config,'postgres')});
    try{await admin.connect();if(databaseName)await admin.query(`DROP DATABASE ${pg.escapeIdentifier(databaseName)}`);}finally{await admin.end();await local.cluster.stop();}
  }
});

test('real PostgreSQL applies ordered migrations and replay performs no work',async()=>{
  const version=await owner.query('SHOW server_version');
  assert.match(version.rows[0].server_version,/^17\./);
  const applied=await migrate(owner);assert.equal(applied.length,expectedMigrations);
  assert.equal((await migrate(owner)).length,0);
  const history=await owner.query('SELECT name FROM public.pgmigrations ORDER BY id');assert.equal(history.rowCount,expectedMigrations);
  const tables=await owner.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='newbert'");assert.equal(tables.rows[0].n,28);
  await owner.query('GRANT newbert_runtime TO newbert_app');
  runtime=createRuntimePool(connectionUrl(local.config,databaseName,true));
  results.push(`PostgreSQL ${version.rows[0].server_version}: ${expectedMigrations} migrations, replay zero, 28 domain tables`);
});

test('runtime has no owner privileges and database readiness rejects privileged connections',async()=>{
  assert.equal(await databaseState(runtime),'connected');
  const unsafe=createRuntimePool(connectionUrl(local.config,databaseName));
  try{assert.equal(await databaseState(unsafe),'unsafe_role');}finally{await unsafe.end();}
  const roles=await runtime.query('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user');
  assert.deepEqual(roles.rows[0],{rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  await assert.rejects(runtime.query('CREATE TABLE newbert.not_allowed(id int)'),/permission denied/);
  await assert.rejects(runtime.query('SELECT * FROM newbert.app_users'),/permission denied/);
  await assert.rejects(runtime.query('SELECT * FROM newbert.platform_budgets'),/permission denied/);
  results.push('Restricted runtime cannot create tables, read identity mappings or read global budget rows');
});

test('tenant RLS isolates two actual connections and transaction-local context does not leak',async()=>{
  await owner.query('INSERT INTO newbert.app_users(id,auth_issuer,auth_subject) VALUES ($1,$2,$3),($4,$2,$5)',[u1,'f2','one',u2,'two']);
  await owner.query('INSERT INTO newbert.workspaces(id,user_id) VALUES ($1,$2),($3,$4)',[w1,u1,w2,u2]);
  await owner.query('INSERT INTO newbert.projects(id,workspace_id,title) VALUES ($1,$2,$3),($4,$5,$6)',[p1,w1,'One',p2,w2,'Two']);
  assert.equal((await runtime.query('SELECT id FROM newbert.projects')).rowCount,0);
  const other=createRuntimePool(connectionUrl(local.config,databaseName,true));
  try{
    const [one,two]=await Promise.all([
      withWorkspace(runtime,w1,async client=>(await client.query('SELECT id FROM newbert.projects')).rows),
      withWorkspace(other,w2,async client=>(await client.query('SELECT id FROM newbert.projects')).rows)
    ]);
    assert.deepEqual(one,[{id:p1}]);assert.deepEqual(two,[{id:p2}]);
  }finally{await other.end();}
  assert.equal((await runtime.query('SELECT id FROM newbert.projects')).rowCount,0);
  await assert.rejects(withWorkspace(runtime,w1,async()=>{throw new Error('rollback marker');}),/rollback marker/);
  assert.equal((await runtime.query('SELECT id FROM newbert.projects')).rowCount,0);
  await assert.rejects(withWorkspace(runtime,"not-a-uuid",async()=>null),/Invalid workspace/);
  results.push('Two workspaces isolated; missing context and post-commit/rollback queries reveal no tenant rows');
});

test('immutable versions and same-workspace foreign keys hold on the real server',async()=>{
  await assert.rejects(owner.query('INSERT INTO newbert.project_drafts(workspace_id,project_id,schema_version,content) VALUES ($1,$2,1,$3)',[w1,p2,{}]),/foreign key/);
  await owner.query('INSERT INTO newbert.project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode) VALUES ($1,$2,$3,1,1,1,$4,$5,$6)',[v1,w1,p1,{},hash,'automatic']);
  await assert.rejects(owner.query('UPDATE newbert.project_versions SET input_snapshot=$1 WHERE id=$2',[{changed:true},v1]),/immutable/);
  await assert.rejects(owner.query('DELETE FROM newbert.project_versions WHERE id=$1',[v1]),/immutable/);
  results.push('Cross-workspace draft rejected and submitted version UPDATE/DELETE rejected');
});

test('failed migration rolls back partial DDL and leaves applied history unchanged',async()=>{
  const dir=resolve('test-results/f2-bad-migrations',randomUUID());await mkdir(dir,{recursive:true});
  for(const name of await readdir(migrationDirectory))await writeFile(join(dir,name),await readFile(join(migrationDirectory,name)));
  await writeFile(join(dir,'1793318400999_failure.sql'),'-- Up Migration\nCREATE TABLE public.f2_partial_probe(id int);\nSELECT * FROM public.f2_deliberately_missing_relation;\n');
  await assert.rejects(migrate(owner,dir),/f2_deliberately_missing_relation/);
  assert.equal((await owner.query("SELECT to_regclass('public.f2_partial_probe') AS result")).rows[0].result,null);
  assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.pgmigrations')).rows[0].n,expectedMigrations);
  assert.equal((await migrate(owner)).length,0);
  results.push('Invalid migration leaves no partial table or history row; clean re-run is safe');
});

test('Fastify health uses actual DB status while unimplemented API features remain unavailable',async()=>{
  const app=buildApi({database:runtime});
  try{
    const live=await app.inject({method:'GET',url:'/health/live'});assert.equal(live.statusCode,200);assert.equal(live.json().milestone,'F2');
    const ready=await app.inject({method:'GET',url:'/health/ready'});assert.equal(ready.statusCode,503);assert.equal(ready.json().checks.database,'connected');assert.equal(ready.json().checks.mediaStorage,'not_connected');
    const missing=await app.inject({method:'GET',url:'/api/v1/projects'});assert.equal(missing.statusCode,404);assert.equal(missing.json().requestId,missing.headers['x-request-id']);
    assert.equal(missing.headers['cache-control'],'no-store');
  }finally{await app.close();}
  assert.equal(await databaseState(),'not_configured');
  const offline=createRuntimePool(`postgresql://not_used:not_used@127.0.0.1:${await freePort()}/missing`);
  try{assert.equal(await databaseState(offline),'unavailable');}finally{await offline.end();}
  for(const port of ['','-1','65536','abc'])assert.throws(()=>readApiConfig({API_PORT:port}),/API_PORT/);
  results.push('HTTP liveness, real DB probe, safe missing routes, unavailable DB and invalid config verified');
  await mkdir('docs/db',{recursive:true});
  await writeFile('docs/db/f2-validation-results.json',JSON.stringify({date:'2026-10-30',engine:'Native PostgreSQL 17 on loopback; temporary test database',scope:'F2 foundation, migrations and tenant-role baseline; not feature, load or deployment verification',results},null,2)+'\n');
});
