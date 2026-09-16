// In-process Postgres for tests. Same migrations as production.
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';
import { migrationsFolder } from './client';

export async function createTestDb() {
  const db = drizzle({ schema });
  await migrate(db, { migrationsFolder });
  return db;
}
