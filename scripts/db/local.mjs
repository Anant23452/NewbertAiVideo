import { startCluster, connectionUrl } from './local-cluster.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

let running;
try {
  running=await startCluster({port:Number(process.env.LOCAL_PG_PORT||54329)});
  const admin=new pg.Client({connectionString:connectionUrl(running.config,'postgres')});
  try {
    await admin.connect();
    if(!(await admin.query("SELECT 1 FROM pg_database WHERE datname='newbert_dev'")).rowCount)await admin.query('CREATE DATABASE newbert_dev');
  }finally{await admin.end();}
  const path='apps/api/.env';
  let env='';try{env=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!/^RUNTIME_DATABASE_URL=.+$/m.test(env)){
    env=env.replace(/^RUNTIME_DATABASE_URL=.*(?:\r?\n|$)/m,'');
    if(!/^API_HOST=/m.test(env))env+='\nAPI_HOST=127.0.0.1\n';
    if(!/^API_PORT=/m.test(env))env+='\nAPI_PORT=3100\n';
    await writeFile(path,env+`\nRUNTIME_DATABASE_URL=${connectionUrl(running.config,'newbert_dev',true)}\n`,{mode:0o600});
  }
  console.log(`Local PostgreSQL is running on 127.0.0.1:${running.config.port}. Credentials are stored in ignored local files.`);
  console.log('Next: npm run db:migrate. Keep this terminal open; Ctrl+C stops PostgreSQL without deleting its data.');
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(stopping)return;stopping=true;await running.cluster.stop();});
}catch{
  await running?.cluster.stop().catch(()=>{});
  console.error('Local PostgreSQL did not start. Check local port availability and installed native binaries. Credentials are redacted.');
  process.exitCode=1;
}
