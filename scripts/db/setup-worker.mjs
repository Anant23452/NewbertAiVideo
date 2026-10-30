import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {localConfig,localDirectory,connectionUrl} from './local-cluster.mjs';
let client;
try{
  const config=await localConfig();if(!config.workerPassword){config.workerPassword=randomBytes(32).toString('hex');await writeFile(join(localDirectory,'config.json'),JSON.stringify(config),{mode:0o600});}
  client=new pg.Client({connectionString:connectionUrl(config)});await client.connect();
  if(!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='newbert_worker'")).rowCount)throw new Error('Apply F6 migrations first.');
  const role=(await client.query("SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication AS unsafe FROM pg_roles WHERE rolname='newbert_worker_local'")).rows[0];if(role?.unsafe)throw new Error('Unsafe worker login.');
  if(!role)await client.query(`CREATE ROLE newbert_worker_local LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD ${pg.escapeLiteral(config.workerPassword)}`);
  await client.query('GRANT newbert_worker TO newbert_worker_local');
  const url=new URL(connectionUrl(config));url.username='newbert_worker_local';url.password=config.workerPassword;
  let env=await readFile('apps/api/.env','utf8');if(!/^WORKER_DATABASE_URL=.+$/m.test(env)){env=env.replace(/^WORKER_DATABASE_URL=.*(?:\r?\n|$)/m,'');await writeFile('apps/api/.env',env+'\nWORKER_DATABASE_URL='+url.href+'\n',{mode:0o600});}
  console.log('Restricted local worker login configured. No paid provider or cloud resources enabled.');
}catch{console.error('Worker setup failed. Check local database and migrations. Secrets are redacted.');process.exitCode=1;}
finally{await client?.end();}
