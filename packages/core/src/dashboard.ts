import { and, eq, desc, inArray, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import type { Crypto } from "./crypto";
import {
  addresses,
  descriptors,
  donors,
  submissions,
  settlements,
  valuations,
  acknowledgements,
  amendments,
  consents,
  organization,
  organisationSettings,
} from "./db/schema";
import {
  countryCodes,
  reportingCurrencies,
  normaliseOrigins,
  OnboardingError,
} from "./onboarding";

export const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function requireAdmin(role: string) {
  if (!["owner", "admin"].includes(role))
    throw new OnboardingError("Organisation admin access required.");
}
export async function listDonations(
  db: Db,
  orgId: string,
  opts: { id?: string; donorId?: string; limit?: number } = {},
) {
  const query = db
    .select({
      settlement: settlements,
      address: addresses.address,
      donorId: submissions.donorId,
    })
    .from(settlements)
    .innerJoin(addresses, eq(addresses.id, settlements.addressId))
    .leftJoin(
      submissions,
      and(
        eq(submissions.addressId, settlements.addressId),
        eq(submissions.organisationId, orgId),
      ),
    )
    .where(
      and(
        eq(settlements.organisationId, orgId),
        opts.id ? eq(settlements.id, opts.id) : undefined,
        opts.donorId ? eq(submissions.donorId, opts.donorId) : undefined,
      ),
    )
    .orderBy(desc(settlements.firstSeenAt), desc(settlements.id));
  const rows = await (opts.limit ? query.limit(opts.limit) : query);
  const values = rows.length
    ? await db
        .select()
        .from(valuations)
        .where(
          inArray(
            valuations.settlementId,
            rows.map((r) => r.settlement.id),
          ),
        )
        .orderBy(valuations.createdAt)
    : [];
  return rows.map((r) => ({
    ...r,
    values: values.filter((v) => v.settlementId === r.settlement.id),
  }));
}
type DonorRow = typeof donors.$inferSelect;
const readDonor = (crypto: Crypto, d: DonorRow) => ({
  id: d.id,
  name: d.nameEnc ? crypto.decrypt(d.nameEnc) : "",
  email: d.emailEnc ? crypto.decrypt(d.emailEnc) : "",
  attribution: d.attribution,
  verifiedAt: d.verifiedAt,
  createdAt: d.createdAt,
});
export async function listDonors(db: Db, crypto: Crypto, orgId: string) {
  const rows = await db
    .select()
    .from(donors)
    .where(eq(donors.organisationId, orgId))
    .orderBy(desc(donors.createdAt));
  return rows.map((d) => readDonor(crypto, d));
}
export async function donorById(
  db: Db,
  crypto: Crypto,
  orgId: string,
  id: string | null | undefined,
) {
  if (!id || !validId(id)) return null;
  const [row] = await db
    .select()
    .from(donors)
    .where(and(eq(donors.id, id), eq(donors.organisationId, orgId)));
  return row ? readDonor(crypto, row) : null;
}
/** Only the donors a page actually shows, so listing donations never decrypts the whole organisation. */
export async function donorsByIds(
  db: Db,
  crypto: Crypto,
  orgId: string,
  ids: ReadonlyArray<string | null>,
) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return [];
  const rows = await db
    .select()
    .from(donors)
    .where(and(eq(donors.organisationId, orgId), inArray(donors.id, wanted)));
  return rows.map((d) => readDonor(crypto, d));
}
/** Counts and totals for the dashboard, so it does not read every settlement to add them up. */
export async function donationTotals(db: Db, orgId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      confirmedSats: sql<number>`coalesce(sum(${settlements.amountSats}) filter (where ${settlements.status} = 'confirmed'), 0)::bigint`,
    })
    .from(settlements)
    .where(eq(settlements.organisationId, orgId));
  return {
    count: row?.count ?? 0,
    confirmedSats: Number(row?.confirmedSats ?? 0),
  };
}
/** Gap-limit guidance without reading every address ever issued. */
export async function walletGapLimits(db: Db, orgId: string) {
  const rows = await db
    .select({
      id: descriptors.id,
      label: descriptors.label,
      nextIndex: descriptors.nextIndex,
      highestIndex: sql<number | null>`max(${addresses.index})`,
    })
    .from(descriptors)
    .leftJoin(addresses, eq(addresses.descriptorId, descriptors.id))
    .where(eq(descriptors.organisationId, orgId))
    .groupBy(descriptors.id, descriptors.label, descriptors.nextIndex);
  return rows.map((w) => ({
    id: w.id,
    label: w.label,
    gapLimit: Math.max(
      20,
      w.nextIndex - 1 + 20,
      w.highestIndex === null ? 20 : Number(w.highestIndex) + 20,
    ),
  }));
}
export async function donationDetail(db: Db, orgId: string, id: string) {
  if (!validId(id)) return null;
  const row = (await listDonations(db, orgId, { id }))[0];
  if (!row) return null;
  const values = await db
    .select()
    .from(valuations)
    .where(eq(valuations.settlementId, id))
    .orderBy(valuations.createdAt);
  const receipts = await db
    .select()
    .from(acknowledgements)
    .where(eq(acknowledgements.settlementId, id))
    .orderBy(acknowledgements.sentAt);
  const ids = [id, ...values.map((v) => v.id), ...receipts.map((r) => r.id)];
  const changes = await db
    .select()
    .from(amendments)
    .where(
      and(
        eq(amendments.organisationId, orgId),
        inArray(amendments.supersedesId, ids),
      ),
    )
    .orderBy(amendments.createdAt);
  return { ...row, values, receipts, changes };
}
export async function donorConsents(db: Db, orgId: string, id: string) {
  if (!validId(id)) return [];
  return db
    .select({ consent: consents })
    .from(consents)
    .innerJoin(donors, eq(donors.id, consents.donorId))
    .where(and(eq(donors.organisationId, orgId), eq(donors.id, id)));
}
export async function eraseDonor(
  db: Db,
  orgId: string,
  role: string,
  id: string,
  confirmed: boolean,
) {
  requireAdmin(role);
  if (!validId(id) || !confirmed)
    throw new OnboardingError("Confirm permanent erasure first.");
  // FK actions erase consent and detach historical records atomically, without retaining PII in an audit message.
  const removed = await db
    .delete(donors)
    .where(and(eq(donors.id, id), eq(donors.organisationId, orgId)))
    .returning({ id: donors.id });
  if (!removed.length) throw new OnboardingError("Donor not found.");
}
export async function walletManifest(db: Db, orgId: string) {
  const wallets = await db
    .select({
      id: descriptors.id,
      label: descriptors.label,
      status: descriptors.status,
      scriptType: descriptors.scriptType,
      network: descriptors.network,
      nextIndex: descriptors.nextIndex,
    })
    .from(descriptors)
    .where(eq(descriptors.organisationId, orgId));
  const issued = await db
    .select({ address: addresses })
    .from(addresses)
    .innerJoin(descriptors, eq(descriptors.id, addresses.descriptorId))
    .where(eq(descriptors.organisationId, orgId))
    .orderBy(addresses.index);
  return wallets.map((w) => ({
    ...w,
    gapLimit: Math.max(
      20,
      w.nextIndex - 1 + 20,
      ...issued
        .filter((a) => a.address.descriptorId === w.id)
        .map((a) => a.address.index + 20),
    ),
    addresses: issued
      .filter((a) => a.address.descriptorId === w.id)
      .map((a) => a.address),
  }));
}
/** RFC 4180 with spreadsheet formula protection, including leading whitespace/control characters. */
export function csv(rows: unknown[][]) {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let s =
              value == null
                ? ""
                : value instanceof Date
                  ? value.toISOString()
                  : String(value);
            if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
function clean(value: string, label: string, max: number, min = 1) {
  const v = value.trim();
  if (v.length < min || v.length > max || /[\u0000-\u001f\u007f]/.test(v))
    throw new OnboardingError(`Enter a valid ${label}.`);
  return v;
}
export async function updateDashboardSettings(
  db: Db,
  orgId: string,
  role: string,
  input: Record<string, string>,
) {
  requireAdmin(role);
  let patch: Partial<typeof organisationSettings.$inferInsert>;
  switch (input.intent) {
    case "organisation":
      if (
        !countryCodes.includes(input.country!) ||
        !(reportingCurrencies as readonly string[]).includes(
          input.reportingCurrency!,
        )
      )
        throw new OnboardingError("Choose a valid country and currency.");
      patch = {
        registrationNumber: clean(
          input.registrationNumber ?? "",
          "registration number",
          100,
          0,
        ),
        country: input.country,
        reportingCurrency: input.reportingCurrency,
      };
      break;
    case "email":
      if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.replyTo ?? ""))
        throw new OnboardingError("Enter a valid reply-to email.");
      patch = {
        senderName: clean(input.senderName ?? "", "sender name", 120),
        replyTo: clean(input.replyTo!, "reply-to email", 254).toLowerCase(),
      };
      break;
    case "origins":
      patch = { allowedOrigins: normaliseOrigins(input.origins ?? "") };
      break;
    default:
      throw new OnboardingError("Unknown settings section.");
  }
  await db.transaction(async (tx) => {
    if (input.intent === "organisation")
      await tx
        .update(organization)
        .set({ name: clean(input.name ?? "", "organisation name", 200, 2) })
        .where(eq(organization.id, orgId));
    await tx
      .update(organisationSettings)
      .set(patch)
      .where(eq(organisationSettings.organisationId, orgId));
  });
}
export const widgetPresets = ["satsrecord", "minimal", "custom"] as const;
export const widgetDefaults = {
  preset: "satsrecord",
  accent: "#d5e4f8",
  background: "#fafcff",
  text: "#293442",
  buttonText: "#293442",
  showBranding: true,
  heading: "Donate bitcoin",
  description: "Support our work with a bitcoin donation.",
  button: "Get donation address",
  consent: "Keep me updated by email.",
};
export type WidgetConfig = typeof widgetDefaults;
export function resolveWidgetConfig(
  input?: Partial<WidgetConfig> | null,
): WidgetConfig {
  const config = { ...widgetDefaults, ...input };
  // Older non-custom presets stored the then-default orange palette even though
  // they did not use those fields. Start Custom with its own palette instead.
  if (
    input?.preset !== "custom" &&
    input?.accent?.toLowerCase() === "#f7931a" &&
    ["#ffffff", "#fff7ea"].includes(input.background?.toLowerCase() ?? "")
  ) {
    for (const key of ["accent", "background", "text", "buttonText"] as const)
      config[key] = widgetDefaults[key];
  }
  if (!widgetPresets.includes(config.preset as (typeof widgetPresets)[number]))
    config.preset = "satsrecord";
  return config;
}
export async function saveWidgetConfig(
  db: Db,
  orgId: string,
  role: string,
  input: WidgetConfig,
) {
  requireAdmin(role);
  if (!widgetPresets.includes(input.preset as (typeof widgetPresets)[number]))
    throw new OnboardingError("Choose a valid preset.");
  for (const key of ["accent", "background", "text", "buttonText"] as const)
    if (!/^#[0-9a-f]{6}$/i.test(input[key]))
      throw new OnboardingError("Choose a valid colour.");
  if (typeof input.showBranding !== "boolean")
    throw new OnboardingError("Choose whether to show SatsRecord branding.");
  const config = {
    ...input,
    heading: clean(input.heading, "heading", 100),
    description: clean(input.description, "description", 240),
    button: clean(input.button, "button label", 60),
    consent: clean(input.consent, "consent label", 300),
  };
  await db
    .update(organisationSettings)
    .set({ widgetConfig: config })
    .where(eq(organisationSettings.organisationId, orgId));
}
export function widgetSnippet(
  origin: string,
  orgId: string,
  config: WidgetConfig,
) {
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const preset = widgetPresets.includes(
    config.preset as (typeof widgetPresets)[number],
  )
    ? config.preset
    : "satsrecord";
  const customStyle =
    preset === "custom"
      ? ` style="--sr-accent:${escape(config.accent)};--sr-background:${escape(config.background)};--sr-text:${escape(config.text)};--sr-button-text:${escape(config.buttonText ?? widgetDefaults.buttonText)}"`
      : "";
  return `<script defer src="${escape(origin)}/widget/v1.js"></script>\n<satsrecord-donate org="${escape(orgId)}" api="${escape(origin)}" preset="${escape(preset)}" show-branding="${config.showBranding !== false}"${customStyle}>\n  <span slot="heading">${escape(config.heading)}</span>\n  <span slot="description">${escape(config.description ?? widgetDefaults.description)}</span>\n  <span slot="button">${escape(config.button)}</span>\n  <span slot="consent">${escape(config.consent)}</span>\n</satsrecord-donate>`;
}
