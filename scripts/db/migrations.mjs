import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';

export const migrationDirectory = fileURLToPath(new URL('../../packages/database/migrations/', import.meta.url));
export async function migrate(client, directory = migrationDirectory) {
  return runner({ dbClient: client, dir: directory, direction: 'up', schema: 'public', migrationsSchema: 'public', migrationsTable: 'pgmigrations', checkOrder: true, singleTransaction: true, noLock: false, verbose: false,
    logger: { info() {}, warn() {}, error() {}, debug() {} } });
}
