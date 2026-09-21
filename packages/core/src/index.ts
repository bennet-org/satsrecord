// Public surface of @satsrecord/core. Design in docs/design.md.
export * from "./domain";
export * from "./url";
export * from "./db/schema";
export { createDb, type Db } from "./db/client";
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
export * from "./settlement-processing";
export * from "./demo";
export * from "./donation-notifications";
