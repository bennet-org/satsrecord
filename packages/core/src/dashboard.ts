import { and, eq, desc, inArray } from "drizzle-orm";
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
export async function listDonations(db: Db, orgId: string, id?: string) {
  const rows = await db
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
        id ? eq(settlements.id, id) : undefined,
      ),
    )
    .orderBy(desc(settlements.firstSeenAt), desc(settlements.id));
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
export async function listDonors(db: Db, crypto: Crypto, orgId: string) {
  const rows = await db
    .select()
    .from(donors)
    .where(eq(donors.organisationId, orgId))
    .orderBy(desc(donors.createdAt));
  return rows.map((d) => ({
    id: d.id,
    name: d.nameEnc ? crypto.decrypt(d.nameEnc) : "",
    email: d.emailEnc ? crypto.decrypt(d.emailEnc) : "",
    attribution: d.attribution,
    verifiedAt: d.verifiedAt,
    createdAt: d.createdAt,
  }));
}
export async function donationDetail(db: Db, orgId: string, id: string) {
  if (!validId(id)) return null;
  const row = (await listDonations(db, orgId, id))[0];
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
export const widgetDefaults = {
  accent: "#f7931a",
  background: "#ffffff",
  text: "#171717",
  heading: "Donate bitcoin",
  button: "Get donation address",
  consent: "Keep me updated by email.",
};
export type WidgetConfig = typeof widgetDefaults;
export async function saveWidgetConfig(
  db: Db,
  orgId: string,
  role: string,
  input: WidgetConfig,
) {
  requireAdmin(role);
  for (const key of ["accent", "background", "text"] as const)
    if (!/^#[0-9a-f]{6}$/i.test(input[key]))
      throw new OnboardingError("Choose a valid colour.");
  const config = {
    ...input,
    heading: clean(input.heading, "heading", 100),
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
  return `<script type="module" src="${escape(origin)}/widget/v1.js"></script>\n<satsrecord-donate org="${escape(orgId)}" style="--sr-accent:${escape(config.accent)};--sr-background:${escape(config.background)};--sr-text:${escape(config.text)}">\n  <span slot="heading">${escape(config.heading)}</span>\n  <span slot="button">${escape(config.button)}</span>\n  <span slot="consent">${escape(config.consent)}</span>\n</satsrecord-donate>`;
}
