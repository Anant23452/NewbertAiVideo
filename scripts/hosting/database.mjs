import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import pg from 'pg';

export const projectRef='bwekgdqczkunygcvrkaf';
export async function hostedSettings() {
  return parseEnv(await readFile('.local/hosted.env','utf8'));
}
export function hostedDatabaseOptions(value, ca) {
  if(!value)throw Error('Save the Supabase migration connection string in .local/hosted.env.');
  let url;
  try {url=new URL(value)}catch{throw Error('Invalid hosted database configuration.');}
  const direct=url.hostname===`db.${projectRef}.supabase.co`;
  const pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooler)||
     !url.password||decodeURIComponent(url.password).includes('[YOUR-PASSWORD]')||
     (url.port&&url.port!=='5432')||url.pathname!=='/postgres'||
     (pooler&&decodeURIComponent(url.username)!==`postgres.${projectRef}`)||
     (direct&&url.username!=='postgres')||url.hash)
    throw Error('Use the intended Supabase project direct/session-pooler admin connection on port 5432.');
  for(const [name,value] of url.searchParams)
    if(name!=='sslmode'||!['require','verify-full'].includes(value))throw Error('Unsupported hosted database URL option.');
  // Explicit TLS validation: do not let sslmode=require override certificate verification.
  url.search='';
  return {connectionString:url.href,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:10000,statement_timeout:15000};
}
export async function hostedClient() {
  const settings=await hostedSettings();
  const ca=settings.SUPABASE_CA_CERT_PATH ? await readFile(settings.SUPABASE_CA_CERT_PATH,'utf8'):undefined;
  const client=new pg.Client(hostedDatabaseOptions(settings.SUPABASE_MIGRATION_DATABASE_URL,ca));
  return client;
}
