import { and, asc, eq, inArray, lt, or } from "drizzle-orm";
import type { Db } from "./db/client";
import type { Crypto } from "./crypto";
import type { SettlementServices } from "./settlement-processing";
import { OnboardingError } from "./onboarding";
import { escapeHtml } from "./auth/emails";
import {
  donationNotifications,
  emailLog,
  member,
  organisationSettings,
  organization,
  settlements,
  user,
  valuations,
} from "./db/schema";

export async function saveDonationNotifications(
  db: Db,
  crypto: Crypto,
  orgId: string,
  role: string,
  input: Record<string, string>,
) {
  if (!["owner", "admin"].includes(role))
    throw new OnboardingError(
      "Only owners and admins can change notifications.",
    );
  const mode = input.notificationMode;
  const email = (input.notificationEmail ?? "").trim().toLowerCase();
  if (mode !== "off" && mode !== "per-donation" && mode !== "daily")
    throw new OnboardingError("Choose a notification frequency.");
  if (
    email &&
    (email.length > 254 ||
      !/^[^\s<>@\x00-\x1f\x7f]+@[^\s<>@\x00-\x1f\x7f]+\.[^\s<>@\x00-\x1f\x7f]+$/.test(
        email,
      ))
  )
    throw new OnboardingError("Enter a valid notification email.");
  await db.transaction(async (tx) => {
    await tx
      .update(organisationSettings)
      .set({
        notificationMode: mode,
        notificationEmailEnc: email ? crypto.encrypt(email) : null,
      })
      .where(eq(organisationSettings.organisationId, orgId));
    // Changing preferences cancels queued notices; new payments use the new settings.
    await tx
      .update(donationNotifications)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(donationNotifications.organisationId, orgId),
          eq(donationNotifications.status, "pending"),
        ),
      );
  });
}

/** Called immediately after settlement and periodically for retries and completed UTC-day digests. */
export async function deliverDonationNotifications(
  services: Omit<SettlementServices, "rates">,
  orgId: string,
  options: { now?: Date; flushDaily?: boolean } = {},
) {
  const now = options.now ?? new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return services.db.transaction(async (tx) => {
    // One sender per organisation, also serializes against preference changes.
    const [settings] = await tx
      .select()
      .from(organisationSettings)
      .where(eq(organisationSettings.organisationId, orgId))
      .for("update");
    if (!settings || settings.notificationMode === "off") return 0;
    const [org] = await tx
      .select()
      .from(organization)
      .where(eq(organization.id, orgId));
    if (!org) return 0;
    const rows = await tx
      .select({
        notice: donationNotifications,
        payment: settlements,
        valuation: valuations,
      })
      .from(donationNotifications)
      .innerJoin(
        settlements,
        eq(settlements.id, donationNotifications.settlementId),
      )
      .innerJoin(valuations, eq(valuations.settlementId, settlements.id))
      .where(
        and(
          eq(donationNotifications.organisationId, orgId),
          eq(donationNotifications.status, "pending"),
          options.flushDaily
            ? undefined
            : or(
                eq(donationNotifications.mode, "per-donation"),
                lt(donationNotifications.createdAt, midnight),
              ),
        ),
      )
      .orderBy(asc(donationNotifications.createdAt));
    if (!rows.length) return 0;
    let recipients: string[];
    if (settings.notificationEmailEnc)
      recipients = [services.crypto.decrypt(settings.notificationEmailEnc)];
    else
      recipients = (
        await tx
          .select({ email: user.email })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(eq(member.organizationId, orgId), eq(member.role, "owner")),
          )
      ).map((r) => r.email);
    if (!recipients.length) throw new Error("No notification recipient");
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key =
        row.notice.mode === "daily"
          ? row.notice.createdAt.toISOString().slice(0, 10)
          : row.notice.settlementId;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      const daily = group[0]!.notice.mode === "daily";
      const demo = group.some((r) => r.valuation.method === "fixed-demo-rate");
      const templateVersion = daily ? "charity-digest@1" : "charity-donation@1";
      const paragraphs = [
        ...(demo
          ? [
              "DEMONSTRATION: this notification includes simulated payments valued at fixed example rates.",
            ]
          : []),
        `${org.name}: ${group.length} ${daily ? "donations in your daily digest" : "donation recorded"}.`,
        ...group.map(
          (r) =>
            `${r.payment.amountSats} sats · ${r.valuation.currency} ${r.valuation.amount} · reference ${r.payment.id}`,
        ),
        "Open your SatsRecord dashboard to review the donation records. Change notification preferences in Settings.",
      ];
      for (const to of new Set(recipients)) {
        const result = await services.mailer.send({
          to,
          from: services.from,
          subject: `${demo ? "[Demo] " : ""}${daily ? "Daily donation digest" : "Donation received"} · ${org.name}`,
          templateVersion,
          text: paragraphs.join("\n\n"),
          html: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(""),
        });
        await tx.insert(emailLog).values({
          organisationId: orgId,
          templateVersion,
          provider: services.mailer.name,
          providerMessageId: result.providerMessageId,
        });
      }
      await tx
        .update(donationNotifications)
        .set({ status: "sent", sentAt: now })
        .where(
          inArray(
            donationNotifications.settlementId,
            group.map((r) => r.notice.settlementId),
          ),
        );
    }
    return rows.length;
  });
}

export async function deliverPendingDonationNotifications(
  services: Omit<SettlementServices, "rates">,
) {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const orgs = await services.db
    .selectDistinct({ id: donationNotifications.organisationId })
    .from(donationNotifications)
    .where(
      and(
        eq(donationNotifications.status, "pending"),
        or(
          eq(donationNotifications.mode, "per-donation"),
          lt(donationNotifications.createdAt, midnight),
        ),
      ),
    )
    .limit(100);
  let sent = 0,
    failed = 0;
  for (const org of orgs) {
    try {
      sent += await deliverDonationNotifications(services, org.id);
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
