import { hostedClient } from './database.mjs';
let client;
try {
  client=await hostedClient();await client.connect();
  const {rows}=await client.query(`SELECT current_setting('server_version_num')::int AS version,
    EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls,
    to_regnamespace('newbert') IS NULL AND to_regnamespace('newbert_auth') IS NULL AS application_target_empty,
    to_regclass('auth.users') IS NOT NULL AS managed_auth_present,
    (SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user) AS can_provision_roles`);
  if(!rows[0].tls)throw Error('TLS required');
  console.log(JSON.stringify({check:'read-only hosted database preflight',...rows[0]},null,2));
} catch {
  console.error('Hosted database check failed. Verify saved project URL/password, reachability and trusted TLS certificate. No credentials or provider errors are printed.');
  process.exitCode=1;
} finally {await client?.end().catch(()=>{});}
