import { and, eq, gt } from "drizzle-orm";
import type { Db } from "./db/client";
import { invitation, member, organization, passkey } from "./db/auth-schema";

/** Role given to the creating user. Better Auth's default; the only one that can delete the organisation. */
export const CREATOR_ROLE = "owner";
/** Role given to invited colleagues: everything except deleting the organisation. v1 has one role in practice. */
export const INVITED_ROLE = "admin";

export function slugify(name: string) {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "org";
}

/**
 * Create an organisation with `userId` as owner. Written directly rather than through Better Auth's endpoint so it
 * runs inside the caller's transaction and the public create endpoint can stay disabled.
 */
export async function createOrganisation(
  db: Db,
  input: { name: string; userId: string },
) {
  return db.transaction(async (tx) => {
    const base = slugify(input.name);
    for (let n = 0; ; n++) {
      const slug = n === 0 ? base : `${base}-${n + 1}`;
      const [org] = await tx
        .insert(organization)
        .values({ name: input.name.trim(), slug })
        // Unlike a caught unique violation, DO NOTHING leaves PostgreSQL's transaction usable.
        .onConflictDoNothing({ target: organization.slug })
        .returning();
      if (!org) continue;
      await tx.insert(member).values({
        organizationId: org.id,
        userId: input.userId,
        role: CREATOR_ROLE,
      });
      return org;
    }
  });
}

/** The user's memberships, oldest first. v1 shows the first as the active organisation. */
export async function membershipsFor(db: Db, userId: string) {
  return db.query.member.findMany({
    where: eq(member.userId, userId),
    with: { organization: true },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
}

export async function membershipIn(
  db: Db,
  userId: string,
  organisationId: string,
) {
  return db.query.member.findFirst({
    where: and(
      eq(member.userId, userId),
      eq(member.organizationId, organisationId),
    ),
    with: { organization: true },
  });
}

/** Members with their user rows, oldest first. */
export async function listMembers(db: Db, organisationId: string) {
  return db.query.member.findMany({
    where: eq(member.organizationId, organisationId),
    with: { user: true },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
}

/** Better Auth member invitations still open for this organisation, newest first. */
export async function listPendingMemberInvitations(
  db: Db,
  organisationId: string,
) {
  return db.query.invitation.findMany({
    where: and(
      eq(invitation.organizationId, organisationId),
      eq(invitation.status, "pending"),
      gt(invitation.expiresAt, new Date()),
    ),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
}

export type MemberInvitationState =
  | {
      state: "valid";
      invitation: NonNullable<Awaited<ReturnType<typeof loadInvitation>>>;
    }
  | { state: "unknown" | "used" | "expired" };

async function loadInvitation(db: Db, id: string) {
  return db.query.invitation.findFirst({
    where: eq(invitation.id, id),
    with: { organization: true },
  });
}

/** Look up a member invitation by id without a session; the accept itself goes through Better Auth. */
export async function findMemberInvitation(
  db: Db,
  id: string,
): Promise<MemberInvitationState> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { state: "unknown" };
  const inv = await loadInvitation(db, id);
  if (!inv) return { state: "unknown" };
  if (inv.status !== "pending") return { state: "used" };
  if (inv.expiresAt.getTime() < Date.now()) return { state: "expired" };
  return { state: "valid", invitation: inv };
}

export async function passkeysFor(db: Db, userId: string) {
  return db.query.passkey.findMany({
    where: eq(passkey.userId, userId),
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });
}
