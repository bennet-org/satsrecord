# Phase 6: donation simulation

The full walkthrough and isolated startup command are in [demo.md](demo.md). This checklist focuses on the simulation service.

## Local walkthrough

1. Follow the README development setup and apply migrations. Enable `SIMULATE_DONATIONS=true` in the web app's development environment; leave `RESEND_API_KEY` unset to use console mail. Restart `pnpm dev`.
2. Sign in, visit `/dev/dashboard` and create a separate fixture organisation. Its public test-vector wallet must never receive real funds.
3. In settings, add the local origin hosting your embedded widget (for example `http://localhost:8080`). Copy the snippet from the Widget page into a page served at that origin.
4. Submit the widget with a donor email and keep it open. The address email appears in the console or protected `/dev/outbox`. Follow its verification link if you want to demonstrate verified attribution.
5. Open Donations → Simulate a donation (`/dev/donations`). Select the newly issued address and submit 100,000 sats.
6. Follow “View donation”: expect a confirmed settlement, GBP 48.99 at the fixed GBP 48,992/BTC rate, and an acknowledgement with the donor's attribution at send time. The message explicitly identifies the simulation and fixed example rate. The embedded widget shows received on its next poll.
7. Repeat with the same address and amount: the settlement and acknowledgement remain single records. A different amount is rejected. Submit a new widget donation for another payment.
8. Try an anonymous donation: settlement and valuation appear, the widget shows received, and no acknowledgement is sent.

Only development builds with the flag enabled expose the action. It requires a signed-in owner/admin of the active organisation and a same-origin POST. Production builds return 404 even if the flag is enabled.

## Automated checks

`pnpm --filter @satsrecord/core exec vitest run src/demo.test.ts` covers concurrent retries, exact valuation rounding, acknowledgement provenance, widget state, mail failures and retries, donor erasure, permissions, tenant isolation, invalid amounts, changed-amount retries and missing rates. `pnpm check` validates the route and public core interfaces.

Settlement and valuation commit atomically before mail delivery. Failed email sends leave them intact; submitting the same amount retries the acknowledgement. Successful sends are serialized using a settlement row lock. A process failure after the provider accepts mail but before the database commits can still cause duplicate mail on retry; provider idempotency or delivery reconciliation remains a production delivery concern. No chain detection, reorganisation handling or background email retry scheduler is implemented here.
