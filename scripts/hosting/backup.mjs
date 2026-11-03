import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {localConfig,connectionUrl} from '../db/local-cluster.mjs';
const run=promisify(execFile);
const config=await localConfig();
const client=new pg.Client({connectionString:connectionUrl(config),connectionTimeoutMillis:5000});
try {
 await client.connect();
 const counts=(await client.query(`SELECT (SELECT count(*) FROM newbert.projects)::int AS projects,
 (SELECT count(*) FROM newbert.workspaces)::int AS workspaces,
 (SELECT count(*) FROM newbert.generation_jobs WHERE state='running')::int AS running_jobs`)).rows[0];
 if(counts.running_jobs)throw Error('Stop running jobs before backup');
 const directory=resolve('.local/migration/backup-'+randomUUID());await mkdir(directory,{recursive:true,mode:0o700});
 const file=join(directory,'newbert.dump');
 const binary=process.env.PG_DUMP_PATH || resolve('.local/pg-client/pg_dump.exe');
 await run(binary,['--format=custom','--no-owner','--file',file],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:String(config.port),PGUSER:'newbert_owner',PGPASSWORD:config.ownerPassword,PGDATABASE:'newbert_dev'},windowsHide:true,timeout:120000,maxBuffer:1024*1024});
 // These ignored, private files are needed to restore sessions and encrypted state.
 await copyFile('.local/postgres/config.json',join(directory,'postgres-config.json'));
 await copyFile('apps/api/.env',join(directory,'api.env'));
 await copyFile('.env',join(directory,'providers.env'));
 const report={file,counts,createdAt:new Date().toISOString(),restoreVerified:false};
 await writeFile(join(directory,'manifest.json'),JSON.stringify(report,null,2),{mode:0o600});
 await writeFile('.local/migration/latest-backup.json',JSON.stringify({directory,file}),{mode:0o600});
 console.log(JSON.stringify({backup:'created',directory,counts,restoreVerified:false}));
}catch{console.error('Source backup failed. No schema change or cloud database write was performed; details are redacted.');process.exitCode=1}
finally{await client.end().catch(()=>{})}
