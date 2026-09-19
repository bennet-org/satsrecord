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

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = null;
  ctx.locals.session = null;
  ctx.locals.org = null;
  ctx.locals.isOperator = false;

  const path = ctx.url.pathname;
  if (!sessionPrefixes.some((p) => path === p || path.startsWith(p + "/")))
    return next();

  const s = await auth.api.getSession({ headers: ctx.request.headers });
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
      if (m)
        await auth.api.setActiveOrganization({
          body: { organizationId: m.organizationId },
          headers: ctx.request.headers,
        });
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
      return ctx.redirect(`/login?next=${encodeURIComponent(path)}`);
    if (path.startsWith("/admin") && !ctx.locals.isOperator)
      return ctx.rewrite("/404");
    if (path.startsWith("/app") && !ctx.locals.org && path !== "/app/new")
      return ctx.redirect(ctx.locals.isOperator ? "/admin" : "/app/new");
  }
  const response = await next();
  if (path.startsWith("/app") || path.startsWith("/_actions"))
    response.headers.set("Cache-Control", "no-store");
  return response;
});
