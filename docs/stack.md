# Stack

**Constraint:** the demo ([ROADMAP](../ROADMAP.md) Phases 0–6) is built on the production stack. When the full build starts, the chain backend is added, not swapped in. That rules out serverless-only hosting (the poller and node are long-running), a throwaway schema, and auth that cannot self-host.

Pinned at scaffold (15 September 2026): Astro 7.3, @astrojs/node 11.1, Tailwind 4.3 via `@tailwindcss/vite`, Vite 8.3, TypeScript 6.0, pnpm 12.4 (via corepack), Node 24. Re-check the registry before adding anything; do not assume versions from memory.

Conventions established in Phase 1:

- Environment through `astro:env` (schema in `astro.config.ts`); secrets never via `process.env` in app code. `.env.example` lists them.
- Fonts through Astro's Fonts API (Fontsource provider), self-hosted at build. No Google Fonts requests.
- `packages/core` exports TypeScript source; Vite consumes it directly. Drizzle schema in `packages/core/src/db/schema.ts`, SQL migrations in `packages/core/drizzle`, applied with `pnpm --filter @satsrecord/core db:migrate`. Tests run the same migrations against PGlite in-process, so `pnpm test` needs no database.
- Repository functions take a driver-agnostic `Db` and a `Mailer`, so the web action, the worker and tests share one code path.

Homepage is fully static and framework-free. `/request-access` is the only on-demand route (Astro Actions need one). Screenshots for review: `node scripts/shots.mjs <baseUrl> <outDir>` uses Playwright against the system Chrome, no browser download, and reports horizontal overflow at 1440 and 400 px.

Conventions established in Phase 2:

- `output: "server"`; marketing pages opt in with `prerender = true`. The 404 page stays on demand so server pages can rewrite to it.
- Better Auth is configured once in `packages/core/src/auth` (`createAuth`) and instantiated in `apps/web/src/lib/services.ts`. Its Drizzle schema (`packages/core/src/db/auth-schema.ts`) was generated with `auth generate` and is hand-maintained since. Ids are uuids; timestamps are timestamptz; column names keep Better Auth's American spelling.
- Middleware resolves the session and active organisation into `Astro.locals` for app, admin, invite and action routes only, and guards `/app/*` and `/admin/*`.
- Login, signup and invite pages post to Better Auth's endpoints from a small vanilla script (`src/scripts/auth-client.ts`) so its rate limits apply; everything else is server-rendered forms and Astro Actions. Sign-out and the passkey skip are plain POST routes. No React yet.
- Organisations are created by our own code (`createOrganisation`), never through Better Auth's public endpoint, which is disabled. Creator is `owner`, invited colleagues are `admin`.
- Magic links go only to existing users, invited addresses and operators, unless `OPEN_SIGNUP=true`. The page copy is the same either way.
- Integration tests in core drive `auth.handler` and `auth.api` against PGlite, including the magic-link redirect and cookies, so no browser is needed for the auth flows.

## Layout

pnpm workspaces, TypeScript throughout.

```
apps/web          Astro, SSR, Node adapter. Marketing site, app (auth, onboarding,
                  dashboard), widget API, widget script hosting.
apps/worker       Full build only. Poller: detection, valuation, acknowledgement.
                  Same Docker image, different entrypoint.
packages/core     Drizzle schema, domain logic, derivation, chain/rate/mail
                  interfaces and implementations, email templates. No framework imports.
packages/widget   Embeddable web component. Vanilla TS, Vite library build, one script.
docs/
```

## Choices

| Layer        | Choice                                                                                                               | Why                                                                                                            | Full-build delta                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Site and app | Astro, Node adapter, SSR                                                                                             | Preference. Static marketing pages and a server-rendered app in one deploy. Actions for forms.                 | None                                                           |
| Islands      | React                                                                                                                | shadcn/ui speeds up the dashboard. Used only where interactive.                                                | None                                                           |
| Styling      | Tailwind v4, shadcn/ui, tokens from `brand/README.md`                                                                |                                                                                                                | None                                                           |
| Database     | Postgres. Neon hosted, docker compose locally.                                                                       | Append-only schema, jsonb, standard for self-host.                                                             | None                                                           |
| ORM          | Drizzle over node-postgres (`pg`)                                                                                    | TypeScript migrations. Plain TCP driver rather than Neon's serverless driver so self-host runs identical code. | None                                                           |
| Auth         | Better Auth: magic link, passkeys, organization plugin, Drizzle adapter                                              | Self-hostable, orgs built in, passwordless.                                                                    | Roles                                                          |
| Email        | Resend behind a `Mailer` interface; SMTP (Nodemailer) and console implementations                                    | Deliverability is the stated top risk. Self-host uses SMTP.                                                    | Branded sending                                                |
| Derivation   | `@scure/bip32`, `@scure/btc-signer`, hand-written descriptor parser for `wpkh`, `sh(wpkh)`, `tr`, `wsh(sortedmulti)` | Small, audited, no native dependencies. Parser scope is tiny.                                                  | Core RPC `Deriver` for multisig                                |
| Detection    | `ChainSource` interface with a fake implementation                                                                   | Demo drives the fake.                                                                                          | mempool.space and Core RPC implementations, worker             |
| Rates        | `RateSource` interface with a fixed-rate fake                                                                        |                                                                                                                | Kraken implementation                                          |
| Widget       | Vanilla TS web component, Vite library mode, small QR library                                                        | Framework-free, embeds anywhere, under 15 kB.                                                                  | None                                                           |
| Encryption   | AES-GCM via WebCrypto, key from env                                                                                  | Descriptors and PII.                                                                                           | KMS-backed key                                                 |
| Hosting      | Docker image on Fly.io; Neon Postgres                                                                                | Long-running process. Same image later runs on a box next to the node. Local only until demo sign-off.         | Worker machine, node, Cloudflare in front of the widget script |
| Testing      | Vitest (core, widget), Playwright (auth, onboarding, widget flows)                                                   |                                                                                                                |                                                                |
| Jobs         | Not needed in demo                                                                                                   |                                                                                                                | pg-boss or a plain loop. Decide at Phase 7.                    |

## Demo-specific

- `SIMULATE_DONATIONS=true` enables a dashboard action that injects a settlement against an issued address through the fake `ChainSource`. It runs the real valuation and acknowledgement code path, sends the real email, and flips the widget to its received state.
- `OPEN_SIGNUP=true` bypasses the invite requirement locally.
- Seed script: demo charity, a signet or mainnet zpub, donors, a spread of donations.
- All of the above are flags on production code, not a separate build.

## Not chosen

- **Serverless (Vercel, Netlify, Workers) for the app.** The poller and node need a long-running process, and it would fork the self-host path.
- **SQLite or Turso.** Pleasant for self-host, but a second dialect. Postgres in compose is fine.
- **Clerk, Auth0, Supabase Auth.** Not self-hostable, or tie the app to a platform.
- **bitcoinjs-lib.** Heavier; `@scure` covers single-sig. Multisig goes to Core anyway.
- **A second framework for the app** (Next, SvelteKit). Two frameworks for one product.
- **Copying from `bitcoin-serverless-payments`.** Same idea (serverless holds the xpub, derives, serves to a widget) but no record-keeping and a rotating pool, which contradicts never-reuse. Not worth porting.
