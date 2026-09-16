import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accessRequestCountries = ['GB', 'US', 'EU', 'other'] as const;
export type AccessRequestCountry = (typeof accessRequestCountries)[number];

export const accessRequestStatuses = ['new', 'invited', 'declined'] as const;

/** Hosted is invite-only. Requests land here from the marketing site. */
export const accessRequests = pgTable('access_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  organisation: text('organisation').notNull(),
  website: text('website'),
  name: text('name').notNull(),
  email: text('email').notNull(),
  country: text('country', { enum: accessRequestCountries }).notNull(),
  message: text('message'),
  status: text('status', { enum: accessRequestStatuses }).notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
});
