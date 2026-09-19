# SatsRecord

Non-custodial bitcoin donations for charities and non-profits. Product brief in [project-brief.md](project-brief.md), technical design in [docs/design.md](docs/design.md), stack in [docs/stack.md](docs/stack.md), plan in [ROADMAP.md](ROADMAP.md), brand in [brand/README.md](brand/README.md).

## Layout

```
apps/web         Astro site and app (Node adapter)
packages/core    Domain logic, schema, adapters. No framework imports.
packages/widget  Embeddable web component
```

## Develop

```
corepack enable            # pnpm
pnpm install
cp .env.example .env       # then edit: BETTER_AUTH_SECRET at least
docker compose up -d db    # Postgres on :5432
pnpm --filter @satsrecord/core db:migrate
pnpm dev                   # http://localhost:4321; sent mail at /dev/outbox with DEV_OUTBOX=true
pnpm test                  # core tests, in-process Postgres, no Docker needed
pnpm build && pnpm start   # production server
```

Hosted is invite-only. Put your address in `OPERATOR_EMAILS`, sign in at `/login`, and issue invites from `/admin`. `OPEN_SIGNUP=true` enables `/signup` instead.

## Onboarding

Phase 3 lives at `/app/setup`: saved progress, mainnet wallet verification, email sender, website origins and the future widget snippet. See [the test checklist](docs/onboarding-testing.md). Set `SIMULATE_DONATIONS=true` in `apps/web/.env` to expose the development-only used-account warning fixture. The actual donation simulation flow arrives in Phase 6.

## Deploy

Netlify builds `apps/web` with the Netlify adapter (`netlify.toml`; the adapter is chosen by `NETLIFY=true`). Site settings: base directory `/`, package directory `apps/web`. Environment: `DATABASE_URL` (Neon, pooled), `BETTER_AUTH_SECRET`, `APP_URL` (the site's origin), `OPERATOR_EMAILS`, `RESEND_API_KEY`, `MAIL_FROM` (a domain verified in Resend), and from Phase 3 `ENCRYPTION_KEY` and `INDEX_KEY`. The build command runs migrations first. The Dockerfile builds the same app with the node adapter for self-hosting.

## Licence

Application: AGPL-3.0. Widget (`packages/widget`): MIT. Licence files land with the first release.

## Dashboard

Phase 4 adds donations and donor records, confirmed donor erasure, CSV exports, address manifests with gap-limit guidance, widget customisation and settings. Apply migration 0005 before use. For a separate seeded demo organisation, sign in and visit `/dev/dashboard` with `SIMULATE_DONATIONS=true` in development. See the [dashboard testing checklist](docs/dashboard-testing.md). The widget preview is visual; address issuance and email delivery arrive in Phase 5.
