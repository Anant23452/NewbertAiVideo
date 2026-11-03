// Run after stopping source API/worker and before the final database export.
// Copies only registered artifacts; no deletions or database edits.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { LocalMediaStore } from '../../packages/database/src/media.js';
import { localConfig, connectionUrl } from '../db/local-cluster.mjs';
const apply=process.argv.includes('--apply');
const local=new LocalMediaStore();
// Deliberately disable legacy fallback when checking cloud presence.
const {parseEnv}=await import('node:util');
const settings=parseEnv(await readFile('.env','utf8'));
const {SupabaseMediaStore}=await import('../../packages/database/src/supabase-media.js');
const cloud=new SupabaseMediaStore(settings.SUPABASE_URL!,settings.SUPABASE_SECRET_KEY!,settings.SUPABASE_STORAGE_BUCKET!);
const db=new pg.Client({connectionString:connectionUrl(await localConfig())});
const report={mode:apply?'copy':'verify-only',registered:0,alreadyCloud:0,needsCopy:0,copied:0,deleted:0,verified:0};
try {
 await db.connect();
 if(!(await cloud.ready()))throw Error('Private bucket not ready');
 const active=(await db.query("SELECT count(*)::int n FROM newbert.generation_jobs WHERE state='running'")).rows[0].n;
 if(active)throw Error('Stop active processing before migration');
 const artifacts=(await db.query("SELECT workspace_id,id,storage_key,content_hash,byte_size FROM newbert.artifacts WHERE storage_status='available' ORDER BY created_at,id")).rows;
 for(const a of artifacts){
  report.registered++;
  // Cloud get must positively distinguish absence from auth/network failures.
  let bytes=await cloud.getIfPresent(a.storage_key);
  if(bytes){report.alreadyCloud++;}
  else {
   bytes=await local.get(a.storage_key);report.needsCopy++;
   if(bytes.length!==Number(a.byte_size)||createHash('sha256').update(bytes).digest('hex')!==a.content_hash)throw Error('Source integrity failed');
   if(apply){await cloud.put(a.workspace_id,a.id,bytes);bytes=await cloud.get(a.storage_key);report.copied++;}
  }
  if(bytes.length!==Number(a.byte_size)||createHash('sha256').update(bytes).digest('hex')!==a.content_hash)throw Error('Artifact integrity failed');
  report.verified++;
 }
 await mkdir('.local/migration',{recursive:true});
 await writeFile('.local/migration/media-report-'+randomUUID()+'.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report));
} catch {console.error('Media migration stopped; source files and database remain unchanged. Check private configuration, processing state and artifact integrity.');process.exitCode=1;}
finally {await db.end();}
