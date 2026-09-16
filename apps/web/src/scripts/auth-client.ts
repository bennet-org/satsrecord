import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
});

export function errorMessage(error: { status?: number; message?: string }) {
  if (error.status === 429)
    return "Too many attempts. Wait a minute and try again.";
  return error.message || "Something went wrong. Try again.";
}

/**
 * Progressive enhancement for `<form data-magic-link data-callback="/app">`: posts to Better Auth's endpoint
 * (so its rate limits apply), then swaps the form for the element named in `data-sent`.
 */
export function wireMagicLinkForms(root: ParentNode = document) {
  for (const form of root.querySelectorAll<HTMLFormElement>(
    "form[data-magic-link]",
  )) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = String(new FormData(form).get("email") ?? "").trim();
      const button = form.querySelector<HTMLButtonElement>(
        "button[type=submit]",
      );
      const err = form.querySelector<HTMLElement>("[data-error]");
      if (button) button.disabled = true;
      if (err) err.textContent = "";
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: form.dataset.callback || "/app",
        errorCallbackURL: "/login?error=link",
      });
      if (error) {
        if (err) err.textContent = errorMessage(error);
        if (button) button.disabled = false;
        return;
      }
      form.hidden = true;
      const sent =
        form.dataset.sent && document.getElementById(form.dataset.sent);
      if (sent) sent.hidden = false;
    });
  }
}
