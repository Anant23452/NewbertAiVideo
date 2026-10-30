import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { localConfig, localDirectory, connectionUrl } from './local-cluster.mjs';

let client;
try {
  const config=await localConfig();
  if(!config.authPassword){config.authPassword=randomBytes(32).toString('hex');await writeFile(join(localDirectory,'config.json'),JSON.stringify(config),{mode:0o600});}
  client=new pg.Client({connectionString:connectionUrl(config)});await client.connect();
  if(!(await client.query("SELECT to_regclass('auth.workspace_binding') AS name")).rows[0].name)throw new Error('Run db:migrate first.');
  const role=await client.query("SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication AS unsafe FROM pg_roles WHERE rolname='newbert_auth'");
  if(role.rows[0]?.unsafe)throw new Error('Existing identity role is unsafe.');
  if(!role.rowCount)await client.query(`CREATE ROLE newbert_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(config.authPassword)}`);
  await client.query('GRANT newbert_identity TO newbert_auth');
  const url=new URL(connectionUrl(config));url.username='newbert_auth';url.password=config.authPassword;
  const path='apps/api/.env';let env='';try{env=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const values={AUTH_DATABASE_URL:url.href,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),AUTH_BASE_URL:'http://127.0.0.1:3100',APP_ORIGIN:'http://127.0.0.1:3100',AUTH_MAIL_MODE:'local'};
  for(const[name,value]of Object.entries(values)){
    if(new RegExp('^'+name+'=.+$','m').test(env))continue;
    env=env.replace(new RegExp('^'+name+'=.*(?:\\r?\\n|$)','m'),'');env+='\n'+name+'='+value+'\n';
  }
  await writeFile(path,env,{mode:0o600});
  console.log('Local identity login and secret configured in ignored files. No account was registered and no email sent.');
}catch{console.error('Identity setup failed. Start local PostgreSQL and apply migrations first. Credentials are redacted.');process.exitCode=1;}
finally{await client?.end();}
