import pg from 'pg';
import {localConfig,connectionUrl} from './local-cluster.mjs';
const action=process.argv[2]||'status';
if(!['status','pause','resume'].includes(action)){console.error('Use processing status, pause or resume.');process.exit(1);}
const c=new pg.Client({connectionString:connectionUrl(await localConfig())});
try{await c.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(1793318406)');
if(action!=='status')await c.query('UPDATE newbert.processing_policy SET admission_enabled=$1,processing_enabled=$1 WHERE singleton',[action==='resume']);
const policy=(await c.query('SELECT admission_enabled,processing_enabled,workspace_daily_jobs,platform_daily_jobs,global_concurrency,workspace_concurrency,paid_providers_enabled FROM newbert.processing_policy')).rows[0];
const jobs=(await c.query('SELECT state,count(*)::int AS count FROM newbert.generation_jobs GROUP BY state ORDER BY state')).rows;
const uncertain=Number((await c.query("SELECT count(*) AS n FROM newbert.job_attempts WHERE state IN ('submitted','unknown')")).rows[0].n);
await c.query('COMMIT');console.log(JSON.stringify({policy,jobs,uncertainProviderAttempts:uncertain},null,2));
}catch{await c.query('ROLLBACK').catch(()=>{});console.error('Local processing control failed. Details are redacted.');process.exitCode=1;}finally{await c.end();}
