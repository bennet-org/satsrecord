// Better Auth, configured once here so the web app, tests and any future CLI share it.
// Magic link plus passkeys; organisations from the organization plugin. Design in docs/design.md.
import { betterAuth } from "better-auth";
import { magicLink, organization } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import type { MailAddress, Mailer } from "../mail/types";
import { normaliseEmail } from "../crypto";
import { magicLinkEmail, memberInvitationEmail } from "./emails";
import { membershipsFor } from "../organisations";

export * from "./emails";
export * from "./outbox";
export * from "./invitation-errors";

export interface AuthOptions {
  db: Db;
  mailer: Mailer;
  from: MailAddress;
  /** Origin the app is served from, no trailing slash. Links in emails and the passkey relying party derive from it. */
  appUrl: string;
  appName: string;
  secret: string;
  /** Let anyone sign up from /signup and create an organisation. Self-host and local development. */
  openSignup?: boolean | undefined;
  /** Operators can always sign in, invited or not; they have no organisation and issue the invites. */
  operatorEmails?: Iterable<string> | undefined;
  /** Better Auth's built-in limiter, backed by the `rate_limit` table so it works on serverless too. Off only in tests. */
  rateLimit?: boolean | undefined;
}

export const MAGIC_LINK_TTL_SECONDS = 10 * 60;
export const MEMBER_INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createAuth(o: AuthOptions) {
  const url = new URL(o.appUrl);
  const db = o.db;
  const operators = new Set([...(o.operatorEmails ?? [])].map(normaliseEmail));

  /** New accounts only through an invite of either kind, unless signup is open. Existing users always. */
  async function mayReceiveMagicLink(email: string) {
    if (o.openSignup || operators.has(email)) return true;
    const existing = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
      columns: { id: true },
    });
    if (existing) return true;
    const now = new Date();
    const orgInvite = await db.query.organisationInvites.findFirst({
      where: and(
        eq(schema.organisationInvites.email, email),
        isNull(schema.organisationInvites.acceptedAt),
        gt(schema.organisationInvites.expiresAt, now),
      ),
      columns: { id: true },
    });
    if (orgInvite) return true;
    const memberInvite = await db.query.invitation.findFirst({
      where: and(
        eq(schema.invitation.email, email),
        eq(schema.invitation.status, "pending"),
        gt(schema.invitation.expiresAt, now),
      ),
      columns: { id: true },
    });
    return Boolean(memberInvite);
  }

  return betterAuth({
    appName: o.appName,
    baseURL: o.appUrl,
    secret: o.secret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    advanced: { database: { generateId: "uuid" } },
    rateLimit: { enabled: o.rateLimit ?? true, storage: "database" },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          // Silent when the address is unknown and uninvited: the page copy is the same either way, so
          // nobody learns which emails have accounts.
          if (!(await mayReceiveMagicLink(normaliseEmail(email)))) return;
          await o.mailer.send({
            to: email,
            from: o.from,
            ...magicLinkEmail({ url, appName: o.appName }),
          });
        },
      }),
      organization({
        // Organisations are created by our own code on invite acceptance or open signup.
        allowUserToCreateOrganization: false,
        creatorRole: "owner",
        invitationExpiresIn: MEMBER_INVITATION_TTL_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async (data) => {
          await o.mailer.send({
            to: data.email,
            from: o.from,
            ...memberInvitationEmail({
              url: `${o.appUrl}/invitation/${data.id}`,
              appName: o.appName,
              organisationName: data.organization.name,
              inviterName: data.inviter.user.name || data.inviter.user.email,
            }),
          });
        },
      }),
      passkey({
        rpID: url.hostname,
        rpName: o.appName,
        origin: url.origin,
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const memberships = await membershipsFor(db, session.userId);
            return {
              data: {
                ...session,
                activeOrganizationId: memberships[0]?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
