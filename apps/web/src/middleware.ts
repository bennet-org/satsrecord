import { defineMiddleware } from "astro:middleware";
import { membershipIn, membershipsFor, normaliseEmail } from "@satsrecord/core";
import { auth, db, operatorEmails } from "./lib/services";

const sessionPrefixes = [
  "/app",
  "/admin",
  "/invite",
  "/invitation",
  "/login",
  "/signup",
  "/dev",
  "/_actions",
];

/** A <meta> CSP ignores frame-ancestors, so it has to be a header. Static pages: netlify.toml. */
function secureHeaders<T extends Response>(response: T, url: URL) {
  const h = response.headers;
  h.set("Content-Security-Policy", "frame-ancestors 'none'");
  h.set("X-Frame-Options", "DENY");
  h.set("X-Content-Type-Options", "nosniff");
  h.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (!h.has("Referrer-Policy"))
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (url.protocol === "https:")
    h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = null;
  ctx.locals.session = null;
  ctx.locals.org = null;
  ctx.locals.isOperator = false;

  const path = ctx.url.pathname;
  const secure = <T extends Response>(r: T) => secureHeaders(r, ctx.url);
  if (!sessionPrefixes.some((p) => path === p || path.startsWith(p + "/")))
    return secure(await next());

  // Better Auth re-issues the cookie as it rolls the session forward; carry its Set-Cookie through
  // to whatever we return, or the browser's copy expires however active the user is.
  const authCookies: string[] = [];
  const withAuthCookies = <T extends Response>(response: T) => {
    for (const c of authCookies) response.headers.append("set-cookie", c);
    return secure(response);
  };

  const { headers: sessionHeaders, response: s } = await auth.api.getSession({
    headers: ctx.request.headers,
    returnHeaders: true,
  });
  authCookies.push(...sessionHeaders.getSetCookie());
  if (s) {
    ctx.locals.user = s.user;
    ctx.locals.session = s.session;
    ctx.locals.isOperator = operatorEmails.has(normaliseEmail(s.user.email));

    let m = s.session.activeOrganizationId
      ? await membershipIn(db, s.user.id, s.session.activeOrganizationId)
      : undefined;
    if (!m) {
      // No active organisation on the session (joined after login, or removed from the active one).
      m = (await membershipsFor(db, s.user.id))[0];
      if (m) {
        const { headers } = await auth.api.setActiveOrganization({
          body: { organizationId: m.organizationId },
          headers: ctx.request.headers,
          returnHeaders: true,
        });
        authCookies.push(...headers.getSetCookie());
      }
    }
    if (m)
      ctx.locals.org = {
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      };
  }

  if (path.startsWith("/app") || path.startsWith("/admin")) {
    if (!ctx.locals.user)
      return withAuthCookies(
        ctx.redirect(`/login?next=${encodeURIComponent(path)}`),
      );
    if (path.startsWith("/admin") && !ctx.locals.isOperator)
      return withAuthCookies(await ctx.rewrite("/404"));
    if (path.startsWith("/app") && !ctx.locals.org && path !== "/app/new")
      return withAuthCookies(
        ctx.redirect(ctx.locals.isOperator ? "/admin" : "/app/new"),
      );
  }
  const response = withAuthCookies(await next());
  if (path.startsWith("/app") || path.startsWith("/_actions"))
    response.headers.set("Cache-Control", "no-store");
  return response;
});
