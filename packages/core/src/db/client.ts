import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

/** Driver-agnostic handle so repositories run on node-postgres in production and PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle({ client: pool, schema });
}
