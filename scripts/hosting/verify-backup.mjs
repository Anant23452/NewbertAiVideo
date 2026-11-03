import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {localConfig,connectionUrl} from '../db/local-cluster.mjs';
const config=await localConfig();
const saved=JSON.parse(await readFile('.local/migration/latest-backup.json','utf8'));
const manifest=JSON.parse(await readFile(join(saved.directory,'manifest.json'),'utf8'));
const database='newbert_restore_'+randomUUID().replaceAll('-','');
const owner=new pg.Client({connectionString:connectionUrl(config,'postgres')});
let restored;
try {
 await owner.connect();await owner.query('CREATE DATABASE '+pg.escapeIdentifier(database));
 await promisify(execFile)(process.env.PG_RESTORE_PATH||resolve('.local/pg-client/pg_restore.exe'),['--exit-on-error','--no-owner','--dbname',database,saved.file],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(config.port),PGUSER:'newbert_owner',PGPASSWORD:config.ownerPassword},windowsHide:true,timeout:120000,maxBuffer:1024*1024});
 restored=new pg.Client({connectionString:connectionUrl(config,database)});await restored.connect();
 const counts=(await restored.query('SELECT (SELECT count(*) FROM newbert.projects)::int AS projects,(SELECT count(*) FROM newbert.workspaces)::int AS workspaces')).rows[0];
 if(counts.projects!==manifest.counts.projects||counts.workspaces!==manifest.counts.workspaces)throw Error('Restore count mismatch');
 manifest.restoreVerified=true;manifest.restoreDatabase=database;
 await writeFile(join(saved.directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 console.log(JSON.stringify({backupRestore:'verified',counts,restoreDatabase:database,sourceDataChanged:false}));
}catch{console.error('Backup restore verification failed; source database and backup retained. Details are redacted.');process.exitCode=1}
finally{await restored?.end();await owner.end();}
