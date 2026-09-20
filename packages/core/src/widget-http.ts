import {
  consumeWidgetLimit,
  issueWidgetAddress,
  WidgetError,
  widgetConfig,
  widgetSession,
  type WidgetServices,
} from "./widget";

/** Public API deliberately uses bearer tokens, never dashboard cookies. */
export async function handleWidgetRequest(
  request: Request,
  orgId: string,
  ip: string,
  services: WidgetServices,
) {
  // Browsers omit Origin on same-origin GETs. Sec-Fetch-Site is browser-controlled;
  // the resulting origin must still be explicitly on the organisation allowlist.
  const origin =
    request.headers.get("origin") ??
    (request.headers.get("sec-fetch-site") === "same-origin"
      ? new URL(request.url).origin
      : null);
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers });
  try {
    const { name, config } = await widgetConfig(services.db, orgId, origin);
    headers.set("Access-Control-Allow-Origin", origin!);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    await consumeWidgetLimit(
      services.db,
      services.crypto.emailIndex(`widget:read:${ip}`),
      120,
      60_000,
    );
    if (request.method === "GET") {
      const authorization = request.headers.get("authorization");
      if (!authorization) return json({ organisation: name, config });
      if (!authorization.startsWith("Bearer "))
        throw new WidgetError("Invalid donation session.", 401);
      const session = await widgetSession(
        services.db,
        orgId,
        origin!,
        authorization.slice(7),
      );
      return session
        ? json(session)
        : json({ error: "Donation session not found." }, 404);
    }
    if (request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new WidgetError("Send a JSON request.", 415);
    // Read incrementally: Content-Length is not trustworthy and may be absent.
    const reader = request.body?.getReader();
    if (!reader) throw new WidgetError("Missing request body.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        throw new WidgetError("Request is too large.", 413);
      }
      chunks.push(value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new WidgetError("Invalid JSON.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new WidgetError("Invalid submission.");
    return json(
      await issueWidgetAddress(
        services,
        orgId,
        origin!,
        ip,
        input as Record<string, unknown>,
      ),
    );
  } catch (error) {
    if (error instanceof WidgetError) {
      if (error.status === 429) headers.set("Retry-After", "3600");
      return json({ error: error.message }, error.status);
    }
    // Never expose SQL parameters, donor details or descriptors in errors/logs.
    return json(
      {
        error:
          "The donation service is temporarily unavailable. Please try again.",
      },
      503,
    );
  }
}
