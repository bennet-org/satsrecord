# Five-minute charity demo

## Start from a fresh clone

Install Node 22.12 or later, enable pnpm (`corepack enable`), and start Docker. Then:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

The command starts a dedicated Postgres container on loopback port 5437, applies migrations, seeds Harbour Aid, starts the development app on port 4327 and serves an embedded donation page on port 8087. It generates keys in ignored `.demo/keys.json` and reuses them and the demo database on subsequent runs. It does not edit your existing `.env` or use its database. Ports 5437, 4327 and 8087 must be free.

Every email goes to the console mailer. The terminal prints the password for the local outbox. Do not send bitcoin to the demo wallet: it derives real addresses from a public test-vector wallet.

## The walkthrough

1. **0:00 — The charity dashboard.** Open [login](http://localhost:4327/login), enter `demo@example.org`, then open the [outbox](http://localhost:4327/dev/outbox). Use username `outbox` and the password printed by the terminal. Follow the sign-in link, skip the optional passkey prompt, and show Harbour Aid's donation records. Explain that the charity holds its own wallet; SatsRecord never holds private keys.
2. **1:00 — The donor's experience.** Open the [donation page](http://localhost:8087). Enter a fictional name and email, then request a donation address. Show the QR code, copy button and address email in the outbox. Follow the verification link to demonstrate verified donor attribution. No funds need to move.
3. **2:00 — A recorded payment.** On the dashboard, open Donations → Simulate a donation. The newest issued address is selected. Simulate 100,000 sats. The donor widget changes to received on its next poll. Show the acknowledgement and charity notification in the outbox. The demo fixture opts into individual notices; other organisations default to off.
4. **3:00 — The record.** Follow “View donation”. Show the settlement, GBP 48.99 valuation at the fixed GBP 48,992/BTC example rate, attribution, and acknowledgement audit trail. Show donation CSV and address-manifest downloads under Exports. Explain that real chain detection and exchange-rate sourcing are the next phase.
5. **4:00 — Charity preferences.** In Settings, change Donation notifications to Daily digest and optionally choose another recipient. Create and simulate another widget donation. Individual charity notices are now queued. Use “Send queued notifications now” on the simulation page to demonstrate the digest without waiting until midnight. Show the digest in the outbox.

The dashboard contains explicitly fictional historical fixtures. New simulated payments are identified by their fixed-demo-rate valuation and `[Demo]` emails. The widget's received state demonstrates the real polling flow using the simulated settlement.

## Stop and restart

Ctrl-C stops the app, embedded page and notification timer. `pnpm demo:stop` stops the database. `pnpm demo` starts it again with the same records and keys. Do not delete `.demo/keys.json` while retaining the database: its encrypted records depend on those keys.

For a deliberate complete reset, stop the app, run `docker compose -p satsrecord-demo -f compose.demo.yaml down -v`, and delete `.demo/keys.json`. This destroys only the isolated demo data and its keys.

## Notifications outside the demo

Apply migration `0008_donation_notifications.sql`. Notifications are opt-in in Settings: every donation or daily digest, sent to organisation owners when no alternative address is supplied. Chosen addresses are encrypted at rest. Preference changes cancel queued notices and apply to new payments. Notifications contain amounts and record references, without donor identity.

The settlement path attempts immediate notices; failures remain queued. Set a separate random `NOTIFICATION_CRON_SECRET` (at least 32 characters) and arrange a server-side POST to `/api/internal/notifications` every 15 minutes with `Content-Type: application/json` and `Authorization: Bearer <secret>`. The endpoint is unavailable without a valid secret. It retries queued individual notices and sends each completed UTC day's digest. The local demo calls it every minute while running. Production scheduling must be configured by the deployment operator.

Delivery and the mail provider are not one atomic transaction: a crash after provider acceptance but before the database commits can duplicate a message on retry. Production delivery reconciliation/provider idempotency is still needed before launch.

## Verification

- `pnpm check`
- `pnpm --filter @satsrecord/core exec vitest run --maxWorkers=1`
- `pnpm build`
- With `pnpm demo` running and Chrome installed: `node scripts/demo-smoke.mjs`

The browser check uses only the isolated demo and adds sample donations. It covers login, widget issuance and received state, acknowledgement, individual and daily charity notices, request guards, and phone layout. Screenshots are written to `/tmp/satsrecord-demo`.
