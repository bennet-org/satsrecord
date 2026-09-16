import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { ConsoleMailer } from "../mail/console";
import { createAuth, type Auth } from "./index";
import {
  acceptOrganisationInvite,
  createOrganisationInvite,
  findOrganisationInvite,
} from "../organisation-invites";
import { member, organization } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";

const appUrl = "http://localhost:4321";
const from = { name: "SatsRecord", address: "hello@satsrecord.org" };

let db: Db;
let mailer: ConsoleMailer;
let auth: Auth;

beforeEach(async () => {
  db = await createTestDb();
  mailer = new ConsoleMailer(() => {});
  auth = createAuth({
    db,
    mailer,
    from,
    appUrl,
    appName: "SatsRecord",
    secret: "test-secret-that-is-long-enough-for-hmac",
    rateLimit: false,
  });
});

function lastUrl(prefix: string) {
  const msg = mailer.sent.at(-1)!;
  const m = msg.text.match(
    new RegExp(`${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^\\s]+`),
  );
  if (!m) throw new Error(`no ${prefix} link in:\n${msg.text}`);
  return m[0];
}

/** Request a magic link, click it, return a headers object carrying the session cookie. */
async function signIn(email: string, callbackURL = "/app") {
  const before = mailer.sent.length;
  await auth.api.signInMagicLink({
    body: { email, callbackURL },
    headers: new Headers(),
  });
  if (mailer.sent.length === before) return null;
  const link = lastUrl(`${appUrl}/api/auth/magic-link/verify`);
  const res = await auth.handler(new Request(link, { redirect: "manual" }));
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe(`${appUrl}${callbackURL}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
  return new Headers({ cookie });
}

describe("magic link", () => {
  it("sends nothing to an unknown, uninvited address", async () => {
    const h = await signIn("nobody@example.org");
    expect(h).toBeNull();
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("organisation invite", () => {
  it("invite → magic link → accept creates the organisation with the user as owner", async () => {
    const { token, url } = await createOrganisationInvite(
      db,
      mailer,
      {
        email: "Finance@Example.org",
        organisationName: "Example Trust",
        invitedBy: "operator@satsrecord.org",
      },
      { from, appUrl, appName: "SatsRecord" },
    );
    expect(url).toBe(`${appUrl}/invite/${token}`);
    expect(mailer.sent[0]).toMatchObject({
      to: "finance@example.org",
      templateVersion: "organisation-invite@1",
    });
    expect((await findOrganisationInvite(db, token)).state).toBe("valid");
    expect((await findOrganisationInvite(db, "nope")).state).toBe("unknown");

    const h = await signIn("finance@example.org", `/invite/${token}/accept`);
    expect(h).not.toBeNull();
    const s1 = await auth.api.getSession({ headers: h! });
    expect(s1?.user.email).toBe("finance@example.org");
    expect(s1?.session.activeOrganizationId).toBeNull();

    const wrong = await acceptOrganisationInvite(db, token, {
      id: s1!.user.id,
      email: "someone-else@example.org",
    });
    expect(wrong.state).toBe("wrong_email");

    const accepted = await acceptOrganisationInvite(db, token, s1!.user);
    expect(accepted.state).toBe("created");
    if (accepted.state !== "created") throw new Error();
    expect(accepted.organisation.slug).toBe("example-trust");
    const members = await db.select().from(member);
    expect(members).toEqual([
      expect.objectContaining({ userId: s1!.user.id, role: "owner" }),
    ]);
    expect((await findOrganisationInvite(db, token)).state).toBe("accepted");

    await auth.api.setActiveOrganization({
      body: { organizationId: accepted.organisation.id },
      headers: h!,
    });
    const s2 = await auth.api.getSession({ headers: h! });
    expect(s2?.session.activeOrganizationId).toBe(accepted.organisation.id);

    // A later login lands in the organisation without any extra step.
    const h2 = await signIn("finance@example.org");
    const s3 = await auth.api.getSession({ headers: h2! });
    expect(s3?.session.activeOrganizationId).toBe(accepted.organisation.id);
  });

  it("slugs collide safely", async () => {
    const mk = (email: string) =>
      createOrganisationInvite(
        db,
        mailer,
        { email, organisationName: "Same Name", invitedBy: "op" },
        { from, appUrl, appName: "SatsRecord" },
      );
    const a = await mk("a@example.org");
    const b = await mk("b@example.org");
    const ha = await signIn("a@example.org");
    const hb = await signIn("b@example.org");
    const ua = (await auth.api.getSession({ headers: ha! }))!.user;
    const ub = (await auth.api.getSession({ headers: hb! }))!.user;
    await acceptOrganisationInvite(db, a.token, ua);
    await acceptOrganisationInvite(db, b.token, ub);
    const slugs = (await db.select().from(organization)).map((o) => o.slug);
    expect(slugs.sort()).toEqual(["same-name", "same-name-2"]);
  });
});

describe("team", () => {
  async function ownerSession() {
    const { token } = await createOrganisationInvite(
      db,
      mailer,
      {
        email: "owner@example.org",
        organisationName: "Example Trust",
        invitedBy: "op",
      },
      { from, appUrl, appName: "SatsRecord" },
    );
    const h = await signIn("owner@example.org");
    const s = (await auth.api.getSession({ headers: h! }))!;
    const r = await acceptOrganisationInvite(db, token, s.user);
    if (r.state !== "created") throw new Error(r.state);
    await auth.api.setActiveOrganization({
      body: { organizationId: r.organisation.id },
      headers: h!,
    });
    return { h: h!, org: r.organisation };
  }

  it("owner invites a colleague, who signs in and accepts as admin", async () => {
    const { h, org } = await ownerSession();
    const inv = await auth.api.createInvitation({
      body: { email: "colleague@example.org", role: "admin" },
      headers: h,
    });
    expect(mailer.sent.at(-1)).toMatchObject({
      to: "colleague@example.org",
      templateVersion: "member-invitation@1",
    });
    expect(lastUrl(`${appUrl}/invitation/`)).toBe(
      `${appUrl}/invitation/${inv.id}`,
    );

    const hc = await signIn("colleague@example.org", `/invitation/${inv.id}`);
    expect(hc).not.toBeNull();
    await auth.api.acceptInvitation({
      body: { invitationId: inv.id },
      headers: hc!,
    });
    const sc = await auth.api.getSession({ headers: hc! });
    expect(sc?.session.activeOrganizationId).toBe(org.id);

    const list = await auth.api.listMembers({ headers: h });
    expect(list.members.map((m) => [m.user.email, m.role]).sort()).toEqual([
      ["colleague@example.org", "admin"],
      ["owner@example.org", "owner"],
    ]);

    // Admin can invite and remove; owner cannot be removed by an admin.
    await auth.api.createInvitation({
      body: { email: "third@example.org", role: "admin" },
      headers: hc!,
    });
    await expect(
      auth.api.removeMember({
        body: { memberIdOrEmail: "owner@example.org" },
        headers: hc!,
      }),
    ).rejects.toThrow();

    await auth.api.removeMember({
      body: { memberIdOrEmail: "colleague@example.org" },
      headers: h,
    });
    const rows = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, org.id));
    expect(rows).toHaveLength(1);
  });
});
