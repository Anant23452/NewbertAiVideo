import pg, { type PoolClient } from 'pg';

export function createRuntimePool(connectionString: string) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL runtime URL is required.');
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000, statement_timeout: 5000 });
  pool.on('error', () => console.error('Database idle connection failed; credentials are redacted.'));
  return pool;
}

export async function databaseState(pool?: pg.Pool): Promise<'not_configured' | 'unavailable' | 'unsafe_role' | 'migrations_missing' | 'connected'> {
  if (!pool) return 'not_configured';
  try {
    const { rows } = await pool.query<{ unsafe: boolean; migrated: boolean }>(`
      SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole
        OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='newbert' AND n.nspowner=r.oid) AS unsafe,
        to_regclass('newbert.projects') IS NOT NULL AND to_regclass('newbert.generation_jobs') IS NOT NULL AS migrated
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (!rows[0] || rows[0].unsafe) return 'unsafe_role';
    return rows[0].migrated ? 'connected' : 'migrations_missing';
  } catch { return 'unavailable'; }
}

// Only pass a workspace resolved from a trusted identity/service boundary (F3).
// This context setter does not authenticate an arbitrary browser-supplied UUID.
export async function withWorkspace<T>(pool: pg.Pool, workspaceId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error('Invalid workspace identity.');
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.workspace_id',$1,true)", [workspaceId]);
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}
