import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';

export const server = {
  requestAccess: defineAction({
    accept: 'form',
    input: z.object({
      organisation: z.string().trim().min(2).max(200),
      website: z.string().trim().max(200).optional(),
      name: z.string().trim().min(2).max(120),
      email: z.email(),
      country: z.enum(['GB', 'US', 'EU', 'other']),
      message: z.string().trim().max(2000).optional(),
    }),
    handler: async (input) => {
      // TODO(Phase 1): persist to access_requests and notify. Until the schema lands, log only.
      console.log('[access request]', JSON.stringify({ ...input, at: new Date().toISOString() }));
      return { ok: true as const };
    },
  }),
};
