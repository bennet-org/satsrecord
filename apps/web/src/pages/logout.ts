import type { APIRoute } from "astro";
import { auth } from "../lib/services";

/** POST only: a form in the app header. Clears the session cookie and returns to the login page. */
export const POST: APIRoute = async ({ request }) => {
  const res = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  const headers = new Headers({ location: "/login" });
  for (const c of res.headers.getSetCookie()) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
};
