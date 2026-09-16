import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { submitAccessRequest, accessRequestCountries } from "@satsrecord/core";
import { db, mailer, mail } from "../lib/services";

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
    handler: async (input) => {
      try {
        const { id } = await submitAccessRequest(db, mailer, input, mail);
        return { ok: true as const, id };
      } catch (err) {
        console.error("[requestAccess]", err);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your request.",
        });
      }
    },
  }),
};
