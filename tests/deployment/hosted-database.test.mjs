import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedDatabaseOptions} from '../../scripts/hosting/database.mjs';
const valid='postgresql://postgres.bwekgdqczkunygcvrkaf:fixture-password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';
test('hosted database preflight pins project and uses verified TLS even with sslmode=require',()=>{
 const options=hostedDatabaseOptions(valid+'?sslmode=require');
 assert.equal(options.ssl.rejectUnauthorized,true);
 assert.equal(new URL(options.connectionString).search,'');
 assert.equal(hostedDatabaseOptions(valid,'test-ca').ssl.ca,'test-ca');
});
test('remote preflight rejects another project, transaction pooling and unsafe TLS',()=>{
 for(const url of ['',valid.replace('bwekgdqczkunygcvrkaf','different-project'),valid.replace(':5432',':6543'),valid.replace('pooler.supabase.com','attacker.example'),valid+'?sslmode=disable',valid.replace('fixture-password','[YOUR-PASSWORD]')])
  assert.throws(()=>hostedDatabaseOptions(url));
});
