import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { NOTIFICATION_CRON_SECRET } from "astro:env/server";
import { deliverPendingDonationNotifications } from "@satsrecord/core";
import { db, crypto, mailer, mail } from "../../../lib/services";

/** Schedule a POST every 15 minutes; daily queues become eligible at 00:00 UTC. */
export const POST: APIRoute = async ({ request }) => {
  const expected = Buffer.from(`Bearer ${NOTIFICATION_CRON_SECRET ?? ""}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    !NOTIFICATION_CRON_SECRET ||
    NOTIFICATION_CRON_SECRET.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return new Response(null, { status: 404 });
  const result = await deliverPendingDonationNotifications({
    db,
    crypto: crypto(),
    mailer,
    from: mail.from,
  });
  return Response.json(result, {
    status: result.failed ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
};
