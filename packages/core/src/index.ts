// Public surface of @satsrecord/core. Design in docs/design.md.
export * from './domain';
export * from './db/schema';
export { createDb, migrateDb, type Db } from './db/client';
export * from './mail';
export * from './access-requests';
