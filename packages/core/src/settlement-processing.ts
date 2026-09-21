import { and, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import type { Crypto } from "./crypto";
import type { RateSource } from "./domain";
import type { MailAddress, Mailer } from "./mail";
import { escapeHtml } from "./auth/emails";
import {
  acknowledgements,
  donationNotifications,
  donors,
  emailLog,
  organisationSettings,
  organization,
  settlements,
  submissions,
  valuations,
} from "./db/schema";

export interface SettlementServices {
  db: Db;
  crypto: Crypto;
  rates: RateSource;
  mailer: Mailer;
  from: MailAddress;
}

/** Confirmed outputs only. The caller supplies chain evidence; this function does not detect payments. */
export async function recordConfirmedDonation(
  services: SettlementServices,
  input: {
    organisationId: string;
    submissionId: string;
    txid: string;
    vout: number;
    amountSats: number;
    blockTime: Date;
    blockHeight: number;
    confirmations: number;
  },
) {
  if (
    !/^[a-f0-9]{64}$/.test(input.txid) ||
    !Number.isSafeInteger(input.vout) ||
    input.vout < 0 ||
    !Number.isSafeInteger(input.amountSats) ||
    input.amountSats <= 0 ||
    input.amountSats > 2_100_000_000_000_000 ||
    !Number.isSafeInteger(input.blockHeight) ||
    input.blockHeight < 0 ||
    !Number.isSafeInteger(input.confirmations) ||
    input.confirmations < 1 ||
    !Number.isFinite(input.blockTime.getTime())
  )
    throw new Error("Invalid confirmed donation");
  const { db } = services;
  // Serialize retries for a submission. Settlement and valuation commit together before email delivery.
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.id, input.submissionId),
          eq(submissions.organisationId, input.organisationId),
        ),
      )
      .for("update");
    if (!submission) throw new Error("Submission not found");
    const [existing] = await tx
      .select()
      .from(settlements)
      .where(
        and(eq(settlements.txid, input.txid), eq(settlements.vout, input.vout)),
      );
    if (existing) {
      if (
        existing.organisationId !== input.organisationId ||
        existing.addressId !== submission.addressId ||
        existing.amountSats !== input.amountSats ||
        existing.status !== "confirmed"
      )
        throw new Error("Settlement reference conflicts with existing payment");
      return existing.id;
    }
    const [settings] = await tx
      .select()
      .from(organisationSettings)
      .where(eq(organisationSettings.organisationId, input.organisationId))
      .for("update");
    if (!settings?.completedAt || !settings.reportingCurrency)
      throw new Error("Organisation setup is incomplete");
    const rate = await services.rates.rateAt(
      settings.reportingCurrency,
      input.blockTime,
    );
    if (!Number.isFinite(rate.rate) || rate.rate <= 0)
      throw new Error("Invalid valuation rate");
    // Integer arithmetic rounds half up to cents from the six-decimal stored BTC rate.
    const rateString = rate.rate.toFixed(6);
    const micros = BigInt(rateString.replace(".", ""));
    const cents =
      (BigInt(input.amountSats) * micros + 500_000_000_000n) /
      1_000_000_000_000n;
    const amount = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
    const [settlement] = await tx
      .insert(settlements)
      .values({
        organisationId: input.organisationId,
        addressId: submission.addressId,
        kind: "onchain",
        txid: input.txid,
        vout: input.vout,
        amountSats: input.amountSats,
        firstSeenAt: input.blockTime,
        blockTime: input.blockTime,
        blockHeight: input.blockHeight,
        status: "confirmed",
      })
      .returning();
    await tx.insert(valuations).values({
      settlementId: settlement!.id,
      currency: settings.reportingCurrency,
      rate: rateString,
      amount,
      source: rate.source,
      pair: rate.pair,
      method: rate.method,
      rateTimestamp: rate.timestamp,
      confirmationsAtValuation: input.confirmations,
    });
    if (settings.notificationMode !== "off")
      await tx.insert(donationNotifications).values({
        settlementId: settlement!.id,
        organisationId: input.organisationId,
        mode: settings.notificationMode,
      });
    return settlement!.id;
  });
}

/** Retryable delivery. No donor address or rendered message is retained in the accounting records. */
export async function acknowledgeDonation(
  services: SettlementServices,
  organisationId: string,
  settlementId: string,
) {
  return services.db.transaction(async (tx) => {
    const [settlement] = await tx
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.id, settlementId),
          eq(settlements.organisationId, organisationId),
        ),
      )
      .for("update");
    if (!settlement || settlement.status !== "confirmed")
      throw new Error("Confirmed settlement not found");
    const [sent] = await tx
      .select()
      .from(acknowledgements)
      .where(eq(acknowledgements.settlementId, settlementId));
    if (sent) return "sent" as const;
    const [submission] = await tx
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.addressId, settlement.addressId),
          eq(submissions.organisationId, organisationId),
        ),
      );
    if (!submission?.donorId) return "no-email" as const;
    // Lock donor against concurrent erasure until delivery finishes.
    const [donor] = await tx
      .select()
      .from(donors)
      .where(
        and(
          eq(donors.id, submission.donorId),
          eq(donors.organisationId, organisationId),
        ),
      )
      .for("update");
    if (!donor?.emailEnc) return "no-email" as const;
    const [valuation] = await tx
      .select()
      .from(valuations)
      .where(eq(valuations.settlementId, settlementId));
    const [settings] = await tx
      .select()
      .from(organisationSettings)
      .where(eq(organisationSettings.organisationId, organisationId));
    const [org] = await tx
      .select()
      .from(organization)
      .where(eq(organization.id, organisationId));
    if (!valuation || !settings || !org)
      throw new Error("Missing acknowledgement context");
    const demo = valuation.method === "fixed-demo-rate";
    const paragraphs = [
      ...(demo
        ? [
            "DEMONSTRATION ONLY — no bitcoin payment was detected. This is a simulated donation using a fixed example exchange rate.",
          ]
        : []),
      `Thank you for your donation to ${org.name}.`,
      `Amount: ${settlement.amountSats} sats.`,
      `Recorded value: ${valuation.currency} ${valuation.amount}. Rate: ${valuation.rate} ${valuation.currency}/BTC (${valuation.source}, ${valuation.method}).`,
      `Block time: ${settlement.blockTime!.toISOString()}. Transaction: ${settlement.txid}:${settlement.vout}.`,
      `Donor attribution: ${donor.attribution === "email_confirmed" ? "email verified" : "claimed, email not verified"}.`,
      "This acknowledges the recorded donation. It is not a tax receipt or a statement of tax deductibility.",
    ];
    const result = await services.mailer.send({
      to: services.crypto.decrypt(donor.emailEnc),
      from: {
        ...services.from,
        name: `${settings.senderName || org.name} via SatsRecord`,
      },
      ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
      subject: `${demo ? "[Demo] " : ""}Donation acknowledgement from ${org.name}`,
      templateVersion: "donation-acknowledgement@1",
      text: paragraphs.join("\n\n"),
      html: paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join(""),
    });
    await tx.insert(acknowledgements).values({
      settlementId,
      valuationId: valuation.id,
      donorId: donor.id,
      attributionAtSend: donor.attribution,
      templateVersion: "donation-acknowledgement@1",
      providerMessageId: result.providerMessageId,
    });
    await tx.insert(emailLog).values({
      organisationId,
      donorId: donor.id,
      templateVersion: "donation-acknowledgement@1",
      provider: services.mailer.name,
      providerMessageId: result.providerMessageId,
    });
    return "sent" as const;
  });
}
