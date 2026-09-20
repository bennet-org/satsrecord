import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import {
  addresses,
  consents,
  descriptors,
  donors,
  emailLog,
  organisationSettings,
  organization,
  settlements,
  submissions,
  widgetRateLimits,
} from "./db/schema";
import type { Crypto } from "./crypto";
import { normaliseEmail } from "./crypto";
import type { Deriver } from "./domain";
import type { MailAddress, Mailer } from "./mail";
import { escapeHtml } from "./auth/emails";
import { resolveWidgetConfig } from "./dashboard";

export class WidgetError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface WidgetServices {
  db: Db;
  crypto: Crypto;
  deriver: Deriver;
  mailer: Mailer;
  from: MailAddress;
  appUrl: string;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const sessionHash = (orgId: string, origin: string, token: string) =>
  hash(`${orgId}\n${origin}\n${token}`);
function validToken(token: unknown): asserts token is string {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new WidgetError("Invalid donation session.");
}
export async function widgetConfig(
  db: Db,
  orgId: string,
  origin: string | null,
) {
  if (!/^[a-f0-9-]{36}$/i.test(orgId))
    throw new WidgetError("Widget unavailable.", 404);
  const [row] = await db
    .select({ settings: organisationSettings, name: organization.name })
    .from(organisationSettings)
    .innerJoin(
      organization,
      eq(organization.id, organisationSettings.organisationId),
    )
    .where(eq(organisationSettings.organisationId, orgId));
  if (!row?.settings.completedAt)
    throw new WidgetError("Widget unavailable.", 404);
  if (
    !origin ||
    origin === "null" ||
    !row.settings.allowedOrigins?.includes(origin)
  )
    throw new WidgetError(
      "This website is not allowed to use this widget.",
      403,
    );
  return {
    ...row,
    config: resolveWidgetConfig(row.settings.widgetConfig),
  };
}

/** Atomic across web instances, with bounded retention of inactive keys. */
export async function consumeWidgetLimit(
  db: Db,
  key: string,
  maximum: number,
  windowMs: number,
  now = new Date(),
) {
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  await db
    .delete(widgetRateLimits)
    .where(
      lt(widgetRateLimits.windowStart, new Date(now.getTime() - 86_400_000)),
    );
  const [row] = await db
    .insert(widgetRateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: widgetRateLimits.key,
      set: {
        windowStart: start,
        count: sql`case when ${widgetRateLimits.windowStart} = ${start} then ${widgetRateLimits.count} + 1 else 1 end`,
      },
    })
    .returning();
  if (row!.count > maximum)
    throw new WidgetError("Too many requests. Please try again later.", 429);
}

export async function widgetSession(
  db: Db,
  orgId: string,
  origin: string,
  token: string,
) {
  validToken(token);
  const [row] = await db
    .select({
      id: submissions.id,
      addressId: addresses.id,
      address: addresses.address,
      emailStatus: submissions.addressEmailStatus,
    })
    .from(submissions)
    .innerJoin(addresses, eq(addresses.id, submissions.addressId))
    .where(
      and(
        eq(submissions.organisationId, orgId),
        eq(submissions.origin, origin),
        eq(submissions.sessionTokenHash, sessionHash(orgId, origin, token)),
      ),
    );
  if (!row) return null;
  const [funded] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(
      and(
        eq(settlements.addressId, row.addressId),
        ne(settlements.status, "reorged"),
      ),
    )
    .limit(1);
  // No donor details, amounts or transaction identifiers leave this endpoint.
  return {
    address: row.address,
    funded: !!funded,
    emailStatus: row.emailStatus,
  };
}

export async function issueWidgetAddress(
  services: WidgetServices,
  orgId: string,
  origin: string,
  ip: string,
  input: Record<string, unknown>,
) {
  const { db, crypto, deriver } = services;
  const {
    settings,
    name: organisationName,
    config,
  } = await widgetConfig(db, orgId, origin);
  validToken(input.token);
  const token = input.token;
  const existing = await widgetSession(db, orgId, origin, token);
  if (existing) return existing;
  function textField(key: string, max: number) {
    const value = input[key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw new WidgetError(`Please enter a valid ${key}.`);
    return value.trim();
  }
  const name = textField("name", 200);
  const email = normaliseEmail(textField("email", 254));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new WidgetError("Please enter a valid email address.");
  if (typeof input.marketing !== "boolean")
    throw new WidgetError("Invalid marketing preference.");
  if (input.marketing && !email)
    throw new WidgetError("Add an email address to receive updates.");
  // Custom text slots are allowed. Keep the exact displayed label, not a mutable config reference.
  const consentLabel = textField("consentLabel", 300) || config.consent;
  await consumeWidgetLimit(
    db,
    crypto.emailIndex(`widget:issue:ip:${ip}`),
    10,
    3_600_000,
  );
  await consumeWidgetLimit(
    db,
    crypto.emailIndex(`widget:issue:origin:${orgId}:${origin}`),
    100,
    3_600_000,
  );
  const verificationToken = email ? randomBytes(32).toString("hex") : null;
  const created = await db.transaction(async (tx) => {
    const [descriptor] = await tx
      .select()
      .from(descriptors)
      .where(
        and(
          eq(descriptors.organisationId, orgId),
          eq(descriptors.status, "active"),
        ),
      )
      .for("update");
    if (!descriptor)
      throw new WidgetError(
        "This organisation is not ready to accept donations.",
        409,
      );
    // Serialize both the counter and same-token retries, including simultaneous tabs.
    if (await widgetSession(tx, orgId, origin, token)) return null;
    const address = await deriver.derive(
      crypto.decrypt(descriptor.descriptorEnc),
      descriptor.nextIndex,
    );
    await tx
      .update(descriptors)
      .set({ nextIndex: descriptor.nextIndex + 1 })
      .where(eq(descriptors.id, descriptor.id));
    const [issued] = await tx
      .insert(addresses)
      .values({
        descriptorId: descriptor.id,
        index: descriptor.nextIndex,
        address,
      })
      .returning();
    let donorId: string | null = null;
    if (name || email) {
      const [donor] = await tx
        .insert(donors)
        .values({
          organisationId: orgId,
          nameEnc: name ? crypto.encrypt(name) : null,
          emailEnc: email ? crypto.encrypt(email) : null,
          emailIndex: email ? crypto.emailIndex(email) : null,
          attribution: "claimed",
          verificationTokenHash: verificationToken
            ? hash(verificationToken)
            : null,
          verificationExpiresAt: verificationToken
            ? new Date(Date.now() + 7 * 86_400_000)
            : null,
        })
        .returning();
      donorId = donor!.id;
      await tx.insert(consents).values({
        donorId,
        kind: "marketing",
        granted: input.marketing as boolean,
        labelVersion: consentLabel,
      });
    }
    const [submission] = await tx
      .insert(submissions)
      .values({
        organisationId: orgId,
        addressId: issued!.id,
        donorId,
        sessionTokenHash: sessionHash(orgId, origin, token),
        origin,
        addressEmailStatus: email ? "pending" : "none",
      })
      .returning();
    return { address, donorId, submissionId: submission!.id };
  });
  if (created && email && verificationToken) {
    const verificationUrl = `${services.appUrl}/donor/verify#${verificationToken}`;
    const paragraphs = [
      `Your bitcoin donation address for ${organisationName}:`,
      created.address,
      "Send only bitcoin (BTC) on the Bitcoin network. You can use this address later.",
      "Confirm your email address so the charity can attribute this donation to you. The link expires in 7 days. If you did not request this address, ignore this email.",
    ];
    try {
      const sent = await services.mailer.send({
        to: email,
        from: {
          ...services.from,
          name: `${settings.senderName || organisationName} via SatsRecord`,
        },
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
        subject: `Your bitcoin donation address for ${organisationName}`,
        templateVersion: "address-issued@1",
        text: `${paragraphs.join("\n\n")}\n\n${verificationUrl}\n`,
        html: `${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}<p><a href="${escapeHtml(verificationUrl)}">Confirm my email address</a></p>`,
      });
      await db.insert(emailLog).values({
        organisationId: orgId,
        donorId: created.donorId,
        templateVersion: "address-issued@1",
        provider: services.mailer.name,
        providerMessageId: sent.providerMessageId,
      });
      await db
        .update(submissions)
        .set({ addressEmailStatus: "sent" })
        .where(eq(submissions.id, created.submissionId));
    } catch {
      // The issued address remains usable and retries never allocate another one or resend mail.
      await db
        .update(submissions)
        .set({ addressEmailStatus: "failed" })
        .where(eq(submissions.id, created.submissionId));
    }
  }
  return (await widgetSession(db, orgId, origin, token))!;
}

export async function verifyDonorEmail(
  db: Db,
  token: string,
  now = new Date(),
) {
  validToken(token);
  const updated = await db
    .update(donors)
    .set({
      attribution: "email_confirmed",
      verifiedAt: now,
      verificationTokenHash: null,
      verificationExpiresAt: null,
    })
    .where(
      and(
        eq(donors.verificationTokenHash, hash(token)),
        gt(donors.verificationExpiresAt, now),
      ),
    )
    .returning({ id: donors.id });
  return updated.length === 1;
}
