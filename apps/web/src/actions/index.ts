import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import {
  submitAccessRequest,
  AccessRequestLimitError,
  accessRequestCountries,
  createOrganisationInvite,
  createOrganisation,
  INVITED_ROLE,
} from "@satsrecord/core";
import { isAPIError } from "better-auth/api";
import { db, mailer, mail, auth, appUrl, openSignup } from "../lib/services";
import { site } from "../data/marketing";
import { BETTER_AUTH_SECRET } from "astro:env/server";

/** Better Auth's errors carry a message meant for the user; everything else is logged and generic. */
function rethrow(tag: string, err: unknown): never {
  if (isAPIError(err))
    throw new ActionError({ code: "BAD_REQUEST", message: err.message });
  console.error(`[${tag}]`, err);
  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong.",
  });
}

export const server = {
  requestAccess: defineAction({
    accept: "form",
    input: z.object({
      organisation: z.string().trim().min(2).max(200),
      website: z.string().trim().max(200).optional(),
      name: z.string().trim().min(2).max(120),
      email: z.email(),
      country: z.enum(accessRequestCountries),
      message: z.string().trim().max(2000).optional(),
    }),
    handler: async (input, ctx) => {
      try {
        const { id } = await submitAccessRequest(db, mailer, input, mail, {
          ip: ctx.clientAddress,
          secret: BETTER_AUTH_SECRET,
        });
        return { ok: true as const, id };
      } catch (err) {
        if (err instanceof AccessRequestLimitError)
          throw new ActionError({
            code: "TOO_MANY_REQUESTS",
            message: err.message,
          });
        console.error("[requestAccess]", err);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your request.",
        });
      }
    },
  }),

  /** Operator: invite an organisation to set up, optionally from an access request. */
  inviteOrganisation: defineAction({
    accept: "form",
    input: z.object({
      email: z.email(),
      organisationName: z.string().trim().min(2).max(200),
      accessRequestId: z.uuid().optional(),
    }),
    handler: async (input, ctx) => {
      if (!ctx.locals.isOperator || !ctx.locals.user)
        throw new ActionError({ code: "FORBIDDEN" });
      try {
        const { id } = await createOrganisationInvite(
          db,
          mailer,
          { ...input, invitedBy: ctx.locals.user.email },
          { from: mail.from, appUrl, appName: site.name },
        );
        return { ok: true as const, id, email: input.email };
      } catch (err) {
        rethrow("inviteOrganisation", err);
      }
    },
  }),

  /** Open signup or a user with no organisation left: create one and make them owner. */
  createOrganisation: defineAction({
    accept: "form",
    input: z.object({ name: z.string().trim().min(2).max(200) }),
    handler: async (input, ctx) => {
      const user = ctx.locals.user;
      if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
      if (ctx.locals.org || !openSignup)
        throw new ActionError({ code: "FORBIDDEN" });
      try {
        const org = await createOrganisation(db, {
          name: input.name,
          userId: user.id,
        });
        await auth.api.setActiveOrganization({
          body: { organizationId: org.id },
          headers: ctx.request.headers,
        });
        return { ok: true as const };
      } catch (err) {
        rethrow("createOrganisation", err);
      }
    },
  }),

  inviteMember: defineAction({
    accept: "form",
    input: z.object({ email: z.email() }),
    handler: async (input, ctx) => {
      const org = ctx.locals.org;
      if (!org) throw new ActionError({ code: "FORBIDDEN" });
      try {
        await auth.api.createInvitation({
          body: {
            email: input.email,
            role: INVITED_ROLE,
            organizationId: org.id,
          },
          headers: ctx.request.headers,
        });
        return { ok: true as const, email: input.email };
      } catch (err) {
        rethrow("inviteMember", err);
      }
    },
  }),

  removeMember: defineAction({
    accept: "form",
    input: z.object({ memberId: z.uuid() }),
    handler: async (input, ctx) => {
      const org = ctx.locals.org;
      if (!org) throw new ActionError({ code: "FORBIDDEN" });
      try {
        await auth.api.removeMember({
          body: { memberIdOrEmail: input.memberId, organizationId: org.id },
          headers: ctx.request.headers,
        });
        return { ok: true as const };
      } catch (err) {
        rethrow("removeMember", err);
      }
    },
  }),

  cancelInvitation: defineAction({
    accept: "form",
    input: z.object({ invitationId: z.uuid() }),
    handler: async (input, ctx) => {
      if (!ctx.locals.org) throw new ActionError({ code: "FORBIDDEN" });
      try {
        await auth.api.cancelInvitation({
          body: { invitationId: input.invitationId },
          headers: ctx.request.headers,
        });
        return { ok: true as const };
      } catch (err) {
        rethrow("cancelInvitation", err);
      }
    },
  }),
};
