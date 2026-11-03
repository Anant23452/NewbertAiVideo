import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from 'pg';
const env=parseEnv(await readFile('.local/hosted-runtime.env','utf8'));
const ca=await readFile('deploy/supabase-ca.crt','utf8');
const connect=key=>{const u=new URL(env[key]);u.search='';return new pg.Pool({connectionString:u.href,ssl:{ca,rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000})};
const runtime=connect('RUNTIME_DATABASE_URL'),identity=connect('AUTH_DATABASE_URL'),worker=connect('WORKER_DATABASE_URL');
let checks=0;
try {
 for(const pool of [runtime,identity,worker]){const role=(await pool.query('SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication AS unsafe FROM pg_roles WHERE rolname=current_user')).rows[0];if(role.unsafe)throw Error('Unsafe role');checks++;}
 for(const pool of [runtime,worker]){try{await pool.query('SELECT * FROM newbert_auth.account LIMIT 1');throw Error('Unexpected identity access')}catch(e){if(e.code!=='42501')throw e;checks++;}}
 const users=(await identity.query('SELECT id FROM newbert_auth."user" ORDER BY id LIMIT 2')).rows;
 if(users.length<2)throw Error('Need preserved fixture identities');
 const bindings=[];for(const u of users)bindings.push((await identity.query('SELECT * FROM newbert.resolve_identity($1)',[u.id])).rows[0]);
 const c=await runtime.connect();
 try{await c.query('BEGIN');await c.query("SELECT set_config('app.workspace_id',$1,true)",[bindings[0].workspace_id]);const own=(await c.query('SELECT id FROM newbert.workspaces')).rows;if(own.length!==1||own[0].id!==bindings[0].workspace_id)throw Error('Isolation failed');if((await c.query('SELECT id FROM newbert.workspaces WHERE id=$1',[bindings[1].workspace_id])).rowCount!==0)throw Error('Cross-workspace access');await c.query('ROLLBACK');checks+=2;}finally{c.release();}
 console.log(JSON.stringify({hostedRoleChecks:checks,verifiedTls:true,leastPrivilege:true,workspaceIsolation:true,credentialsPrinted:false}));
}catch{console.error('Hosted role verification failed; no credentials are displayed.');process.exitCode=1;}
finally{await Promise.all([runtime.end(),identity.end(),worker.end()]);}
