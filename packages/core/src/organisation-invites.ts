// Operator-issued invites: the hosted product is invite-only. Distinct from Better Auth's member invitations.
import { createHash, randomBytes } from "node:crypto";
import { desc, eq, isNull } from "drizzle-orm";
import type { Db } from "./db/client";
import { accessRequests, organisationInvites } from "./db/schema";
import type { MailAddress, Mailer } from "./mail/types";
import { organisationInviteEmail } from "./auth/emails";
import { createOrganisation } from "./organisations";
import { normaliseEmail } from "./crypto";

export const ORGANISATION_INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export interface OrganisationInviteInput {
  email: string;
  organisationName: string;
  accessRequestId?: string | undefined;
  invitedBy: string;
}

/**
 * Store the invite and email the link. Returns the raw token once; only its hash is stored.
 * A linked access request is marked `invited`.
 */
export async function createOrganisationInvite(
  db: Db,
  mailer: Mailer,
  input: OrganisationInviteInput,
  opts: { from: MailAddress; appUrl: string; appName: string },
) {
  const token = randomBytes(32).toString("base64url");
  const email = normaliseEmail(input.email);
  const [row] = await db
    .insert(organisationInvites)
    .values({
      email,
      organisationName: input.organisationName.trim(),
      accessRequestId: input.accessRequestId ?? null,
      tokenHash: hashToken(token),
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + ORGANISATION_INVITE_TTL_MS),
    })
    .returning();
  if (input.accessRequestId) {
    await db
      .update(accessRequests)
      .set({ status: "invited" })
      .where(eq(accessRequests.id, input.accessRequestId));
  }
  const url = `${opts.appUrl}/invite/${token}`;
  const msg = organisationInviteEmail({
    url,
    appName: opts.appName,
    organisationName: row!.organisationName,
  });
  await mailer.send({ to: email, from: opts.from, ...msg });
  return { id: row!.id, token, url };
}

export type InviteState =
  | { state: "valid"; invite: typeof organisationInvites.$inferSelect }
  | { state: "expired" | "accepted" | "unknown" };

export async function findOrganisationInvite(
  db: Db,
  token: string,
): Promise<InviteState> {
  const invite = await db.query.organisationInvites.findFirst({
    where: eq(organisationInvites.tokenHash, hashToken(token)),
  });
  if (!invite) return { state: "unknown" };
  if (invite.acceptedAt) return { state: "accepted" };
  if (invite.expiresAt.getTime() < Date.now()) return { state: "expired" };
  return { state: "valid", invite };
}

/**
 * Turn a valid invite into an organisation owned by `user`. The signed-in email must match the invite:
 * the invite link alone is not proof of identity, the magic link is.
 */
export async function acceptOrganisationInvite(
  db: Db,
  token: string,
  user: { id: string; email: string },
) {
  const found = await findOrganisationInvite(db, token);
  if (found.state !== "valid") return found;
  const { invite } = found;
  if (normaliseEmail(user.email) !== invite.email)
    return { state: "wrong_email" as const, invite };
  return db.transaction(async (tx) => {
    // Re-read under a row lock. Two hits on the link — a double click, a prefetch — would otherwise
    // both pass the check above and create an organisation each, with only one of them recorded.
    const [locked] = await tx
      .select()
      .from(organisationInvites)
      .where(eq(organisationInvites.id, invite.id))
      .for("update");
    if (!locked) return { state: "unknown" as const };
    if (locked.acceptedAt) return { state: "accepted" as const };
    if (locked.expiresAt.getTime() < Date.now())
      return { state: "expired" as const };
    const org = await createOrganisation(tx, {
      name: locked.organisationName,
      userId: user.id,
    });
    await tx
      .update(organisationInvites)
      .set({ acceptedAt: new Date(), organisationId: org.id })
      .where(eq(organisationInvites.id, locked.id));
    return { state: "created" as const, organisation: org };
  });
}

export async function listPendingOrganisationInvites(db: Db) {
  return db.query.organisationInvites.findMany({
    where: isNull(organisationInvites.acceptedAt),
    orderBy: [desc(organisationInvites.createdAt)],
  });
}
