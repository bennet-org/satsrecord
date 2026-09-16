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

// ---------------------------------------------------------------------------
// Domain tables (docs/design.md, "Data model"). Organisations, members, users and
// invitations are owned by Better Auth's organization plugin (Phase 2); domain rows
// carry `organisationId` as text and gain the foreign key in that migration.
// ---------------------------------------------------------------------------

import { bigint, boolean, integer, numeric, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const scriptTypes = ['wpkh', 'sh_wpkh', 'tr', 'wsh_sortedmulti'] as const;
export const networks = ['mainnet', 'testnet'] as const;

/** A charity's receiving descriptor. Encrypted at rest; exactly one active per organisation issues addresses. */
export const descriptors = pgTable(
  'descriptors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: text('organisation_id').notNull(),
    descriptorEnc: text('descriptor_enc').notNull(),
    scriptType: text('script_type', { enum: scriptTypes }).notNull(),
    network: text('network', { enum: networks }).notNull(),
    /** First 8 hex chars of the first key's fingerprint, for display and support. Not secret on its own. */
    label: text('label').notNull(),
    status: text('status', { enum: ['active', 'retired'] }).notNull().default('active'),
    /** Monotonic. Never decremented, never reused, exported in the manifest. */
    nextIndex: integer('next_index').notNull().default(0),
    freshCheckOverridden: boolean('fresh_check_overridden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('descriptors_one_active_per_org').on(t.organisationId).where(sql`${t.status} = 'active'`)],
);

/** Every address ever issued. The manifest export is this table. */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    descriptorId: uuid('descriptor_id').notNull().references(() => descriptors.id),
    index: integer('index').notNull(),
    address: text('address').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('addresses_descriptor_index').on(t.descriptorId, t.index)],
);

export const attributionStatuses = ['anonymous', 'claimed', 'email_confirmed'] as const;

/**
 * Donor PII, one row per submission (identical details still get separate rows). This is the only table
 * erasure touches: deleting a row leaves every settlement, valuation and acknowledgement intact and unattributed.
 */
export const donors = pgTable(
  'donors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: text('organisation_id').notNull(),
    nameEnc: text('name_enc'),
    emailEnc: text('email_enc'),
    /** HMAC of the normalised email. Lookup without plaintext. */
    emailIndex: text('email_index'),
    attribution: text('attribution', { enum: attributionStatuses }).notNull(),
    verificationTokenHash: text('verification_token_hash'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('donors_email_index').on(t.organisationId, t.emailIndex)],
);

/** One widget submission: an address handed to (at most) one donor. */
export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organisationId: text('organisation_id').notNull(),
  addressId: uuid('address_id').notNull().references(() => addresses.id),
  donorId: uuid('donor_id').references(() => donors.id, { onDelete: 'set null' }),
  /** Hash of the widget session token; lets the same session see the same address until funded. */
  sessionTokenHash: text('session_token_hash').notNull(),
  origin: text('origin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Consent records travel with the donor row and disappear with it. */
export const consents = pgTable('consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  donorId: uuid('donor_id').notNull().references(() => donors.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['marketing'] }).notNull(),
  granted: boolean('granted').notNull(),
  /** Version of the label text the donor saw. */
  labelVersion: text('label_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settlementKinds = ['onchain', 'lightning'] as const;
export const settlementStatuses = ['mempool', 'confirmed', 'reorged'] as const;

/** Append-only. Money arriving at an address. Two payments to one address are two rows. */
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: text('organisation_id').notNull(),
    addressId: uuid('address_id').notNull().references(() => addresses.id),
    kind: text('kind', { enum: settlementKinds }).notNull(),
    txid: text('txid'),
    vout: integer('vout'),
    paymentHash: text('payment_hash'),
    amountSats: bigint('amount_sats', { mode: 'number' }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    blockTime: timestamp('block_time', { withTimezone: true }),
    blockHeight: integer('block_height'),
    status: text('status', { enum: settlementStatuses }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('settlements_onchain_ref').on(t.txid, t.vout), uniqueIndex('settlements_lightning_ref').on(t.paymentHash)],
);

/** Append-only. Fair market value pinned at block time, with full provenance. */
export const valuations = pgTable('valuations', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementId: uuid('settlement_id').notNull().references(() => settlements.id),
  currency: text('currency').notNull(),
  /** Price of one BTC in `currency`. */
  rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  source: text('source').notNull(),
  pair: text('pair').notNull(),
  method: text('method').notNull(),
  rateTimestamp: timestamp('rate_timestamp', { withTimezone: true }).notNull(),
  confirmationsAtValuation: integer('confirmations_at_valuation').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only. What was sent to whom, and under which template. Content is reproducible from the row plus the template. */
export const acknowledgements = pgTable('acknowledgements', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementId: uuid('settlement_id').notNull().references(() => settlements.id),
  valuationId: uuid('valuation_id').notNull().references(() => valuations.id),
  donorId: uuid('donor_id').references(() => donors.id, { onDelete: 'set null' }),
  attributionAtSend: text('attribution_at_send', { enum: attributionStatuses }).notNull(),
  templateVersion: text('template_version').notNull(),
  providerMessageId: text('provider_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

export const amendableTables = ['settlements', 'valuations', 'acknowledgements', 'donors'] as const;

/** The one way to change history: a new row supersedes an old one, and this says who, why, and which. */
export const amendments = pgTable('amendments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organisationId: text('organisation_id').notNull(),
  table: text('table_name', { enum: amendableTables }).notNull(),
  supersedesId: uuid('supersedes_id').notNull(),
  replacementId: uuid('replacement_id'),
  reason: text('reason').notNull(),
  amendedBy: text('amended_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every send, without the address. Provider id is enough to trace a message; the donor row holds the PII. */
export const emailLog = pgTable('email_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organisationId: text('organisation_id'),
  donorId: uuid('donor_id').references(() => donors.id, { onDelete: 'set null' }),
  templateVersion: text('template_version').notNull(),
  provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
