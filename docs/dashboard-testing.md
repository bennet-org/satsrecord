# Phase 4: dashboard

Run migrations before starting the app (`pnpm --filter @satsrecord/core db:migrate`). Migration 0005 adds saved widget customisation. Set `DATABASE_URL` (and `DATABASE_URL_UNPOOLED` where needed) for the migration process; the app reads its own environment.

## Seeded walkthrough

1. Start the development app with `SIMULATE_DONATIONS=true`, encryption/index keys, and the console mailer. Sign in using the existing invite flow or `OPEN_SIGNUP=true` and `/dev/outbox`.
2. Visit `/dev/dashboard` and choose **Create demo organisation**. It creates a separate organisation owned by the signed-in user and switches their active organisation. Existing data is untouched. Each invocation creates a fresh fixture.
3. Open the dashboard, donations list and each donation detail. The fixture contains two payments to one address, confirmed and pending valuations, a reorg amendment, claimed and confirmed identities, and an anonymous payment.
4. Open donors and donor detail. Repeated email addresses remain separate submissions. Confirm that consent and related payments render.
5. Download all three exports from `/app/exports`. The address manifest includes 85 issued addresses (only indices 0, 14, 39 and 72 have payments) and a recommended gap limit of 104. All wallets, including retired descriptors, are included. CSVs quote embedded commas/newlines and neutralise spreadsheet formulas.
6. On `/app/widget`, choose a preset and edit labels: the actual widget preview updates immediately. Save, reload and check the snippet. Only saved values enter the snippet. The preview never issues an address. See the [Phase 5 checklist](widget-testing.md) for live embedding.
7. Edit organisation, email and origins in settings. Wallet details are read-only, with a support link for replacement. Existing valuation currencies remain unchanged when reporting currency changes. Team management is linked from settings.
8. On a donor detail, explicitly confirm permanent erasure. The donor page then returns 404; donations, valuations, acknowledgements and email logs remain without that donor reference. Consent records disappear. A separate submission with the same email remains.
9. Repeat at phone width. Tables scroll within their container; the page itself must not overflow.

The seed route is available only in development with the simulation flag and a signed-in user. Fixtures use public test-vector-derived wallets and fictional transactions. Never fund those addresses. Acknowledgement rows are fixtures; no email is sent.

## Widget contract for Phase 5

Use the existing `<satsrecord-donate org="…">` element and `/widget/v1.js`. Customisation is persisted in `organisation_settings.widget_config` and emitted as `--sr-accent`, `--sr-background`, `--sr-text`, plus escaped `heading`, `button` and `consent` text slots. Marketing opt-in starts unticked. Phase 5 must preserve escaping and record the consent label version actually shown to each donor.

## Verification completed

- `pnpm test`: 35 tests passed, including organisation isolation, role/confirmation checks, erasure preservation, settings validation, HTML escaping and CSV formula protection.
- `pnpm check`: no errors or warnings (Astro reports informational hints).
- `pnpm build`: passed.
- All nine dashboard/list/detail/settings pages rendered at 1440px and 390px against an isolated PostgreSQL fixture, with no horizontal page overflow.
- Browser checks passed for three CSV downloads, live text preview, saved widget configuration, saved email settings and donor erasure.

The BTC/sats display preference is stored in a one-year browser cookie and applies throughout the app. CSV exports retain explicit `amount_sats` and ISO currency columns for machine-readable, unambiguous data.
