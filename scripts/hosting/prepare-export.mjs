import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {localConfig,connectionUrl} from '../db/local-cluster.mjs';
import {migrate} from '../db/migrations.mjs';
const config=await localConfig();
const saved=JSON.parse(await readFile('.local/migration/latest-backup.json','utf8'));
const manifest=JSON.parse(await readFile(join(saved.directory,'manifest.json'),'utf8'));
if(!manifest.restoreVerified)throw Error('A verified source backup is required.');
const db=new pg.Client({connectionString:connectionUrl(config)});
try {
 await db.connect();
 const activity=(await db.query("SELECT (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) AS connections,(SELECT count(*)::int FROM newbert.generation_jobs WHERE state='running') AS running")).rows[0];
 if(activity.connections||activity.running)throw Error('Stop source API/worker and other connections before export.');
 await migrate(db);
 const directory=resolve('.local/migration/export-'+randomUUID());await mkdir(directory,{recursive:true,mode:0o700});
 for(const section of ['pre-data','data','post-data']) {
  const args=['--no-owner','--inserts','--column-inserts','--schema=newbert','--schema=newbert_auth','--section='+section,'--file',join(directory,section+'.sql')];
  await promisify(execFile)(process.env.PG_DUMP_PATH||resolve('.local/pg-client/pg_dump.exe'),args,{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(config.port),PGUSER:'newbert_owner',PGPASSWORD:config.ownerPassword,PGDATABASE:'newbert_dev'},windowsHide:true,timeout:120000,maxBuffer:1024*1024});
 }
 await db.query("SET TIME ZONE 'UTC'");
 const tables=(await db.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('newbert','newbert_auth') ORDER BY schemaname,tablename")).rows;
 const hashes=[];
 for(const t of tables){const name=pg.escapeIdentifier(t.schemaname)+'.'+pg.escapeIdentifier(t.tablename);const r=await db.query(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text COLLATE "C"),'')) AS hash FROM ${name} t`);hashes.push({...t,...r.rows[0]});}
 const history=(await db.query('SELECT name,run_on FROM public.pgmigrations ORDER BY id')).rows;
 await writeFile(join(directory,'table-hashes.json'),JSON.stringify(hashes,null,2),{mode:0o600});
 await writeFile(join(directory,'history.json'),JSON.stringify(history,null,2),{mode:0o600});
 await writeFile('.local/migration/latest-export.json',JSON.stringify({directory}),{mode:0o600});
 console.log(JSON.stringify({export:'prepared',directory,tables:hashes.length,rows:hashes.reduce((n,t)=>n+t.rows,0),appliedMigrations:history.length,sourceBackupRetained:true}));
}catch{console.error('Export preparation stopped. Source backup is retained; check active connections and migration state. Details are redacted.');process.exitCode=1}
finally{await db.end();}
