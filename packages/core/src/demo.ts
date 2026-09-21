import { deliverDonationNotifications } from "./donation-notifications";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { addresses, submissions } from "./db/schema";
import { FixedRateSource } from "./fakes/rate";
import {
  acknowledgeDonation,
  recordConfirmedDonation,
  type SettlementServices,
} from "./settlement-processing";

export async function demoSubmissions(db: Db, organisationId: string) {
  return db
    .select({
      id: submissions.id,
      address: addresses.address,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .innerJoin(addresses, eq(addresses.id, submissions.addressId))
    .where(eq(submissions.organisationId, organisationId))
    .orderBy(desc(submissions.createdAt))
    .limit(50);
}

/** The HTTP caller must also enforce a development build, session, organisation role and same-origin POST. */
export async function simulateDonation(
  services: Omit<SettlementServices, "rates">,
  input: {
    enabled: boolean;
    role: string;
    organisationId: string;
    submissionId: string;
    amountSats: number;
  },
) {
  if (!input.enabled || !["owner", "admin"].includes(input.role))
    throw new Error("Donation simulation is disabled or forbidden");
  const [submission] = await services.db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.id, input.submissionId),
        eq(submissions.organisationId, input.organisationId),
      ),
    );
  if (!submission) throw new Error("Submission not found");
  const settlementServices = { ...services, rates: new FixedRateSource() };
  // One simulated payment per submission, stable across double clicks and email retries.
  const txid = createHash("sha256")
    .update(`satsrecord-demo:${input.organisationId}:${input.submissionId}`)
    .digest("hex");
  const settlementId = await recordConfirmedDonation(settlementServices, {
    ...input,
    txid,
    vout: 0,
    blockTime: new Date(),
    blockHeight: 0,
    confirmations: 1,
  });
  let notifications: "processed" | "failed" = "processed";
  try {
    await deliverDonationNotifications(services, input.organisationId);
  } catch {
    notifications = "failed";
  }
  try {
    const email = await acknowledgeDonation(
      settlementServices,
      input.organisationId,
      settlementId,
    );
    return { settlementId, email, notifications };
  } catch {
    // A mail failure must not undo the payment, valuation or widget received state.
    return { settlementId, email: "failed" as const, notifications };
  }
}
