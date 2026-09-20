// Public surface of @satsrecord/core. Design in docs/design.md.
export * from "./domain";
export * from "./db/schema";
export { createDb, migrateDb, type Db } from "./db/client";
export * from "./mail";
export * from "./access-requests";
export * from "./crypto";
export * from "./bitcoin";
export * from "./fakes";
export * from "./auth";
export * from "./organisations";
export * from "./organisation-invites";

export * from "./onboarding";

export * from "./dashboard";
export { seedDashboard } from "./dashboard-fixture";
export * from "./widget";
export * from "./widget-http";
