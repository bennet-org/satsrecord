import { defineConfig, envField, fontProviders } from "astro/config";
import node from "@astrojs/node";
import netlify from "@astrojs/netlify";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://satsrecord.org",
  // The app is on-demand; marketing pages opt in to prerendering.
  output: "server",
  // Netlify sets NETLIFY=true in its build environment; everywhere else (Docker, self-host) is the node adapter.
  adapter: process.env.NETLIFY ? netlify() : node({ mode: "standalone" }),
  vite: { plugins: [tailwindcss()] },
  // Prerendered pages only; on-demand pages and frame-ancestors are handled by headers in middleware.
  security: {
    csp: {
      // astro:assets puts style="display:block" on SVGs; <style> elements stay hash-restricted.
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
      ],
    },
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Schibsted Grotesk",
      cssVariable: "--font-schibsted",
      weights: [400, 500, 700, 800],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["Helvetica Neue", "Arial", "sans-serif"],
    },
  ],
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: "server", access: "secret" }),
      RESEND_API_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Everything server-side is `secret` so it is read at runtime, not inlined at build. One image, many environments.
      MAIL_FROM: envField.string({
        context: "server",
        access: "secret",
        default: "SatsRecord <hello@satsrecord.org>",
      }),
      NOTIFY_EMAIL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Origin the app is served from. Email links, auth callbacks and the passkey relying party derive from it.
      APP_URL: envField.string({
        context: "server",
        access: "secret",
        default: "http://localhost:4321",
      }),
      BETTER_AUTH_SECRET: envField.string({
        context: "server",
        access: "secret",
      }),
      // Comma-separated. These accounts see /admin: access requests and organisation invites.
      OPERATOR_EMAILS: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      // Serve sent mail at /dev/outbox. Only with the console mailer, and never where strangers can reach it:
      // it shows sign-in links.
      DEV_OUTBOX: envField.boolean({
        context: "server",
        access: "secret",
        default: false,
      }),
      OPEN_SIGNUP: envField.boolean({
        context: "server",
        access: "secret",
        default: false,
      }),
      SIMULATE_DONATIONS: envField.boolean({
        context: "server",
        access: "secret",
        default: false,
      }),
      // 32 random bytes each, base64. Required once onboarding stores descriptors (Phase 3).
      ENCRYPTION_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      INDEX_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
});
