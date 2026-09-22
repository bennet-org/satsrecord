# SatsRecord

Non-custodial bitcoin donations for charities and non-profits. Product brief in [project-brief.md](project-brief.md), technical design in [docs/design.md](docs/design.md), stack in [docs/stack.md](docs/stack.md), plan in [ROADMAP.md](ROADMAP.md), brand in [brand/README.md](brand/README.md).

**Under active development; not ready for live donation operations.** Hosted and self-hosted deployments use this same codebase. Publishing the source does not mark a production release.

## Try the demo

With Node 22.12+, pnpm and Docker installed:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

This starts an isolated database, seeds Harbour Aid, and serves the dashboard and an embedded donation page. No real funds or outgoing email are involved. Follow the [five-minute walkthrough](docs/demo.md).

## What works

- Invite-based organisations, passwordless login, passkeys and team management.
- Onboarding at `/app/setup`: saved progress, mainnet wallet address verification, email sender, allowed website origins and an installation snippet.
- An embeddable widget with three visual presets, real address derivation, QR codes, address emails, donor email verification and session restoration.
- Donation and donor records, donor erasure, CSV exports, address manifests with gap-limit guidance, widget customisation and organisation settings.
- Settlement recording, fixed-rate demo valuations, donor acknowledgements, and opt-in charity notifications per donation or as daily digests.

**Still to build:** live chain detection, a real fresh-wallet history check, historical exchange-rate sourcing, and the continuously running worker. Production can issue real addresses but does not yet detect or value incoming bitcoin. Further launch and product work is tracked in [the roadmap](ROADMAP.md).

## Layout

```
apps/web         Astro site and app (Node or Netlify adapter)
packages/core    Domain logic, schema, adapters. No framework imports.
packages/widget  Embeddable web component
```

## Develop

```sh
corepack enable            # pnpm
pnpm install
cp .env.example .env       # configure auth and encryption keys
docker compose up -d db    # Postgres on :5432
pnpm --filter @satsrecord/core db:migrate
pnpm dev                   # http://localhost:4321
pnpm test                  # core tests, in-process Postgres, no Docker needed
pnpm build && pnpm start   # production server
```

`compose.yaml` is for local development only: its database and web ports bind to `127.0.0.1`, and its credentials are public development defaults. Do not use it as a production configuration.

Hosted is invite-only. Put your address in `OPERATOR_EMAILS`, sign in at `/login`, and issue invites from `/admin`. `OPEN_SIGNUP=true` enables `/signup` instead.

For a separate seeded demo organisation in an existing development environment, enable `SIMULATE_DONATIONS=true`, sign in, and visit `/dev/dashboard`. Owners and admins can use `/dev/donations` to simulate a payment against an issued address, record a fixed-rate valuation and send an acknowledgement. The widget then shows received. Simulation routes are unavailable in production builds.

With the console mailer, `DEV_OUTBOX=true` and a separate `DEV_OUTBOX_PASSWORD` of at least 32 characters enable the protected local outbox at `/dev/outbox`.

Testing checklists: [onboarding](docs/onboarding-testing.md), [dashboard](docs/dashboard-testing.md), [widget](docs/widget-testing.md), [simulation](docs/demo-testing.md).

## Deploy

Netlify builds `apps/web` using the checked-in `netlify.toml`. Keep the base directory at the repository root and set the package directory to `apps/web`. The build applies database migrations before building the app. See [production configuration](docs/deployment.md) for environment variables and notification scheduling.

The Dockerfile builds the same app with the Node adapter for self-hosting. The standalone [production Compose configuration](compose.production.yaml) requires your own secrets, keeps Postgres private, and exposes the web server only to a reverse proxy on the host. Follow the [self-hosting guide](docs/self-hosting.md) for setup, current limitations, backups and upgrades.

Netlify preview and branch builds are disabled by default. Production secrets must also be restricted in Netlify's settings; repository configuration alone cannot protect them from a modified pull request.

## Security

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). Maintainers should complete the [publication checks](docs/open-source-release.md) before changing repository visibility.

## Licence

Application: [AGPL-3.0-only](LICENSE). Widget (`packages/widget`): [MIT](packages/widget/LICENSE). Third-party components retain their own licences.
