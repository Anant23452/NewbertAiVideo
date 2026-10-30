// Explicit maintainer tool, not part of startup. Never runs generated SQL.
import { getMigrations } from 'better-auth/db/migration';
import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
// @ts-ignore local tooling module
import { localConfig, connectionUrl } from './local-cluster.mjs';
import { identityOptions } from '../../apps/api/src/modules/identity/service.js';

const pool = new pg.Pool({ connectionString: connectionUrl(await localConfig()) });
try {
  if ((await pool.query("SELECT to_regclass('auth.user') AS existing")).rows[0].existing) throw new Error('Generate initial auth migration only against a database without auth tables.');
  const config = identityOptions(pool, { databaseUrl: '', secret: randomBytes(32).toString('hex'), baseUrl: 'http://127.0.0.1:3100', origin: 'http://127.0.0.1:3100', production: false, mailMode: 'local' }, async () => {});
  const plan = await getMigrations(config);
  if (plan.unsafeChanges.length || plan.schemaProblems.length) throw new Error('Auth schema plan requires manual review.');
  const sql = await plan.compileMigrations();
  await writeFile('packages/database/migrations/1793318400002_auth-schema.sql', '-- Up Migration\n-- Generated from Better Auth 1.7.14 selected options; reviewed before applying.\n' + sql + '\n-- Down Migration\nDO $$ BEGIN RAISE EXCEPTION \'Forward-only auth migration; use a reviewed forward fix.\'; END $$;\n', { flag: 'wx' });
  console.log('Generated the initial Better Auth SQL migration; no SQL was applied.');
} finally { await pool.end(); }
