// Isolated design validation with an in-memory PostgreSQL engine, no production DB.
// Dependencies are installed in a temporary tools directory, not the application.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const toolsDir = process.argv[2] || join(tmpdir(), 'newbert-design-validation');
const require = createRequire(join(resolve(toolsDir), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const parser = require('@apidevtools/swagger-parser');
const results = [];
const check = async (name, fn) => { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const h = 'a'.repeat(64);
async function rejects(sql) {
  let rejected = false;
  try { await db.exec(sql); } catch { rejected = true; }
  assert.equal(rejected,true,'Expected PostgreSQL to reject the invalid mutation');
}
try {
  await check('OpenAPI structural validation and reference resolution', async()=>{
    const spec=await parser.validate(resolve('docs/api/openapi-v1.json'));
    assert.equal(spec.openapi,'3.1.1');
    const ids=[];
    for(const path of Object.values(spec.paths))for(const op of Object.values(path))ids.push(op.operationId);
    assert.equal(new Set(ids).size,ids.length);
    assert.equal(ids.length,40);
  });
  await check('Reference DDL executes on embedded PostgreSQL',async()=>{
    await db.exec(await readFile('docs/db/schema-v1.sql','utf8'));
    await db.exec('SET search_path = newbert, public');
  });
  await db.exec(`INSERT INTO app_users(id,auth_issuer,auth_subject) VALUES ('${id(1)}','test','one'),('${id(2)}','test','two');
    INSERT INTO workspaces(id,user_id) VALUES ('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}');
    INSERT INTO projects(id,workspace_id,title) VALUES ('${id(21)}','${id(11)}','One'),('${id(22)}','${id(12)}','Two');
    INSERT INTO project_versions(id,workspace_id,project_id,version_number,source_draft_revision,schema_version,input_snapshot,input_hash,mode)
    VALUES ('${id(31)}','${id(11)}','${id(21)}',1,1,1,'{}','${h}','automatic'),('${id(32)}','${id(12)}','${id(22)}',1,1,1,'{}','${h}','automatic');`);
  await check('One workspace per user',()=>rejects(`INSERT INTO workspaces(id,user_id) VALUES ('${id(13)}','${id(1)}')`));
  await check('Cross-workspace draft reference rejected',()=>rejects(`INSERT INTO project_drafts(workspace_id,project_id,schema_version,content) VALUES ('${id(11)}','${id(22)}',1,'{}')`));
  await check('Submitted versions cannot be edited or deleted',async()=>{
    await rejects(`UPDATE project_versions SET input_snapshot='{"changed":true}' WHERE id='${id(31)}'`);
    await rejects(`DELETE FROM project_versions WHERE id='${id(31)}'`);
  });
  await db.exec(`INSERT INTO generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key)
    VALUES ('${id(41)}','${id(11)}','${id(21)}','${id(31)}','produce','${id(141)}'),('${id(42)}','${id(12)}','${id(22)}','${id(32)}','produce','${id(142)}')`);
  await check('Only one active job per project',()=>rejects(`INSERT INTO generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key) VALUES ('${id(43)}','${id(11)}','${id(21)}','${id(31)}','produce','${id(143)}')`));
  await check('Cross-workspace job version rejected',()=>rejects(`INSERT INTO generation_jobs(id,workspace_id,project_id,version_id,kind,operation_key,state) VALUES ('${id(44)}','${id(11)}','${id(21)}','${id(32)}','produce','${id(144)}','failed')`));
  await db.exec(`INSERT INTO artifacts(id,workspace_id,project_id,version_id,job_id,kind,storage_key,content_hash,input_fingerprint,mime_type,byte_size,validation_status)
    VALUES ('${id(51)}','${id(11)}','${id(21)}','${id(31)}','${id(41)}','video','test/one.mp4','${h}','${h}','video/mp4',1000,'passed'),
    ('${id(52)}','${id(12)}','${id(22)}','${id(32)}','${id(42)}','video','test/two.mp4','${h}','${h}','video/mp4',1000,'passed')`);
  await check('Project output cannot reference another tenant artifact',()=>rejects(`UPDATE projects SET latest_output_artifact_id='${id(52)}' WHERE id='${id(21)}'`));
  await check('Artifact dependencies cannot cross workspaces',()=>rejects(`INSERT INTO artifact_dependencies VALUES ('${id(11)}','${id(51)}','${id(52)}')`));
  await db.exec(`INSERT INTO instagram_connections(id,workspace_id,remote_account_id,display_name,status,secret_ref,granted_scopes) VALUES ('${id(61)}','${id(11)}','remote-1','Test','active','secret://placeholder','{}')`);
  await check('Only one active Instagram grant per workspace',()=>rejects(`INSERT INTO instagram_connections(id,workspace_id,remote_account_id,display_name,status,secret_ref,granted_scopes) VALUES ('${id(62)}','${id(11)}','remote-2','Test','active','secret://placeholder','{}')`));
  await check('One active owner per remote Instagram account',()=>rejects(`INSERT INTO instagram_connections(id,workspace_id,remote_account_id,display_name,status,secret_ref,granted_scopes) VALUES ('${id(63)}','${id(12)}','remote-1','Test','active','secret://placeholder','{}')`));
  await db.exec(`INSERT INTO usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units) VALUES ('${id(71)}','${id(11)}','narration_ms','2026-10-29T00:00:00Z','2026-10-30T00:00:00Z',1000);
    INSERT INTO usage_reservations(id,workspace_id,job_id,bucket_id,reservation_key,reserved_units) VALUES ('${id(81)}','${id(11)}','${id(41)}','${id(71)}','speech',500);
    INSERT INTO usage_entries(id,workspace_id,reservation_id,event_key,entry_type,units_delta,reason_code) VALUES ('${id(91)}','${id(11)}','${id(81)}','speech-once','incurred',400,'speech')`);
  await check('Usage settlement event deduplicates',()=>rejects(`INSERT INTO usage_entries(id,workspace_id,reservation_id,event_key,entry_type,units_delta,reason_code) VALUES ('${id(92)}','${id(11)}','${id(81)}','speech-once','incurred',400,'speech')`));
  await check('Atomic quota reservation cannot exceed remaining allowance',async()=>{
    const first=await db.query(`UPDATE usage_buckets SET reserved_units=reserved_units+800 WHERE id='${id(71)}' AND used_units+reserved_units+800<=limit_units RETURNING id`);
    const second=await db.query(`UPDATE usage_buckets SET reserved_units=reserved_units+800 WHERE id='${id(71)}' AND used_units+reserved_units+800<=limit_units RETURNING id`);
    assert.equal(first.rows.length,1);assert.equal(second.rows.length,0);
  });
  await check('Stale worker fencing token cannot checkpoint',async()=>{
    await db.exec(`UPDATE generation_jobs SET state='running',lease_owner='new-worker',lease_expires_at=now()+interval '1 minute',lease_token=2 WHERE id='${id(41)}'`);
    const r=await db.query(`UPDATE generation_jobs SET stage='rendering' WHERE id='${id(41)}' AND state='running' AND lease_token=1 RETURNING id`);
    assert.equal(r.rows.length,0);
  });
  await check('RLS hides foreign workspace and missing context from a non-owner role',async()=>{
    await db.exec(`CREATE ROLE design_web NOLOGIN; GRANT USAGE ON SCHEMA newbert TO design_web; GRANT SELECT ON newbert.projects TO design_web; SET ROLE design_web`);
    assert.equal((await db.query('SELECT id FROM projects')).rows.length,0);
    await db.exec(`SELECT set_config('app.workspace_id','${id(11)}',false)`);
    const r=await db.query('SELECT id FROM projects');assert.deepEqual(r.rows.map(x=>x.id),[id(21)]);
    await db.exec('RESET ROLE');
  });
  await writeFile('docs/db/validation-results.json',JSON.stringify({engine:'PGlite embedded PostgreSQL; not a hosted-service or load test',date:'2026-10-29',results},null,2)+'\n');
  console.log(`${results.length} design checks passed.`);
} finally {await db.close();}
