import type { APIRoute } from "astro";

/** Remember the skip for a year; adding a passkey later clears the prompt anyway. */
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.set("passkey-prompt", "skip", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60,
  });
  return redirect("/app", 303);
};
