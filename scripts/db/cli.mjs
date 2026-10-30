import pg from 'pg';
import { localConfig,connectionUrl } from './local-cluster.mjs';
import { migrate } from './migrations.mjs';

const action=process.argv[2];
if(!['up','status'].includes(action)){console.error('Use db:migrate or db:status; destructive down/reset is not provided.');process.exit(1);}
let client;
try {
  const external=process.env.MIGRATION_DATABASE_URL;
  const url=external||connectionUrl(await localConfig());
  const target=new URL(url);
  if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('F2 commands allow local PostgreSQL only.');
  client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});await client.connect();
  if(action==='up'){
    const applied=await migrate(client);
    // Local runtime login is provisioned by db:local; external dev instances must provision their own login.
    if(!external)await client.query('GRANT newbert_runtime TO newbert_app');
    console.log(`Applied ${applied.length} migration(s).`);
  }
  const exists=await client.query("SELECT to_regclass('public.pgmigrations') AS name");
  const history=exists.rows[0].name?(await client.query('SELECT name,run_on FROM public.pgmigrations ORDER BY id')).rows:[];
  console.log(JSON.stringify({applied:history.map(x=>({name:x.name,runOn:x.run_on}))},null,2));
}catch(error){
  console.error('Database command failed. Check that db:local is running, the migration role is valid and pending SQL is correct. Credentials and raw SQL are redacted.');
  process.exitCode=1;
}finally{await client?.end();}
