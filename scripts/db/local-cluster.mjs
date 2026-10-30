import EmbeddedPostgres from 'embedded-postgres';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import pg from 'pg';

export const localDirectory = resolve('.local/postgres');
export function connectionUrl(config, database = 'newbert_dev', runtime = false) {
  const url = new URL(`postgresql://127.0.0.1:${config.port}/${database}`);
  url.username = runtime ? 'newbert_app' : 'newbert_owner';
  url.password = runtime ? config.runtimePassword : config.ownerPassword;
  return url.href;
}
export async function freePort() {
  const socket = createServer();
  await new Promise((yes,no) => { socket.once('error',no);socket.listen(0,'127.0.0.1',yes); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
export async function localConfig(directory = localDirectory) {
  return JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
}
export async function startCluster({ directory = localDirectory, port = 54329 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local database port.');
  await mkdir(directory,{recursive:true});
  let config;
  try { config = await localConfig(directory); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    config = { ownerPassword:randomBytes(32).toString('hex'),runtimePassword:randomBytes(32).toString('hex'),port };
    await writeFile(join(directory,'config.json'),JSON.stringify(config),{flag:'wx',mode:0o600});
  }
  config.port=port;
  const cluster = new EmbeddedPostgres({ databaseDir:join(directory,'data'),user:'newbert_owner',password:config.ownerPassword,port,authMethod:'scram-sha-256',persistent:true,createPostgresUser:false,
    initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){} });
  try { await access(join(directory,'data','PG_VERSION')); }
  catch(error) { if(error.code!=='ENOENT')throw error;await cluster.initialise(); }
  await cluster.start();
  await writeFile(join(directory,'config.json'),JSON.stringify(config),{mode:0o600});
  const admin = new pg.Client({connectionString:connectionUrl(config,'postgres'),connectionTimeoutMillis:5000});
  try {
    await admin.connect();
    const role=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='newbert_app'");
    if(!role.rowCount)await admin.query(`CREATE ROLE newbert_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(config.runtimePassword)}`);
    else {
      const attributes=await admin.query("SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication AS unsafe FROM pg_roles WHERE rolname='newbert_app'");
      if(attributes.rows[0].unsafe)throw new Error('Existing local runtime role is unsafe.');
    }
  }catch(error){await cluster.stop();throw error;}finally{await admin.end();}
  return {cluster,config};
}
