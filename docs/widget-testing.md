# Phase 5: widget

The widget is live at `/widget/v1.js`. Web dev and production builds first build `packages/widget` into the web app's public directory, so Node, Docker and Netlify serve the same bundle. During widget development, run `pnpm --filter @satsrecord/widget build --watch` alongside the web server.

Apply migration 0006 before using the new code. It adds verification expiry, address-email delivery status, unique session hashes and database-backed widget limits. Set `DATABASE_URL` (or `DATABASE_URL_UNPOOLED`) for migrations; the app uses `apps/web/.env` in development.

## Local walkthrough

1. Run migrations, then `pnpm dev` with the console mailer and `DEV_OUTBOX=true`.
2. Finish onboarding with a disposable test wallet. Add `http://localhost:8080` to allowed origins. Use test-vector wallets only for testing; never send money to public test vectors.
3. On `/app/widget`, choose SatsRecord, Minimal or Custom. Custom reveals four colour controls; all styles have editable heading, intro, button and marketing text. Preview the form, anonymous confirmation, address and received states, save, and copy the snippet. Previewing never issues an address.
4. Paste the snippet into a plain HTML page with `<meta charset="utf-8">` and a viewport meta tag. Serve that page on port 8080, for example with `python3 -m http.server 8080` from its directory. Open it at the exact allowed origin.
5. Leave email blank (with or without a name) and submit: an inline confirmation explains that no receipt, confirmation or thank-you can be emailed. Choose **Continue without email**: an address, locally generated QR, copy button and BIP21 wallet link appear. Reload: the same address remains. The manifest contains the new index.
6. In a separate browser session, submit a name and email. Find the address email in `/dev/outbox`; its address matches the widget. Open the verification link and press **Confirm my email address**. The donor changes from `claimed` to `email_confirmed`. The link works once and expires after seven days. Verification does not gate payment.
7. Try a different port, a missing/opaque Origin, or a removed website: issuance and status requests are rejected. Marketing is unticked initially and requires an email when selected. The saved consent contains the displayed label text.
8. Check the presets on desktop and phone. Block localStorage: the widget still works in memory, although a reload cannot restore it. A lost submission response can be retried with the persisted token without issuing or emailing again.

The received state reads recorded non-reorged settlements (including mempool). The widget checks on load and every 15 seconds while visible. No live chain watcher is included in Phase 5; the Phase 6 simulation will write settlements, and Phase 7 supplies real detection. No amounts or transaction identifiers are returned to the widget.

## Automated checks

- `pnpm test` tests real derivation, concurrent submissions, same-session retries, separate identities with identical details, encrypted PII, consent, erasure, mail failure, expired/single-use verification, funded sessions, rollback, exact origins, CORS, input limits and atomic rate limits against migrated PGlite.
- `pnpm check` checks core, widget and Astro types.
- `pnpm build` builds the actual versioned widget and server.
- `node scripts/widget-smoke.mjs` runs Chrome against the production server on 4325 and a plain HTML host on 8088. It creates and drops a disposable local PostgreSQL database, sends mail only through the console mailer, and checks derivation, email confirmation, copy/BIP21/QR, restoration, funded/new donation states, saved dashboard presets, mobile overflow and origin revocation. System Chrome and local Postgres are required. Override the local connection using `WIDGET_TEST_DATABASE_URL`. Screenshots go to `/tmp/satsrecord-widget-design`.

The smoke test inserts a settlement directly into its disposable database to verify the received state; it does not introduce a production simulation endpoint.

## API and storage

`/api/widget/:org` exposes config (`GET`), a session (`GET` with `Authorization: Bearer <token>`), issuance (`POST` JSON), and CORS preflight (`OPTIONS`). Cookies are neither sent nor used. Responses are `no-store`, vary by Origin, and allow only the organisation's exact listed origins. For same-origin GETs where browsers omit Origin, the browser-controlled `Sec-Fetch-Site: same-origin` identifies the request origin, which still must be explicitly allowed. Origin checking restricts browser embedding; it does not authenticate arbitrary HTTP clients.

A 256-bit token is generated and saved before submission. Storage is keyed by API origin and organisation; tokens are hashed with organisation and embedding origin before database storage. The API never returns names or email addresses. An existing token returns the same address even if it is funded; **Make another donation** creates a new token. Descriptor locking and a unique session constraint make retries safe across web instances. A derivation failure rolls back the counter and records.

Limits are database-backed: 10 new issues per IP per hour, 100 per organisation/embedding origin per hour, and 120 API reads/requests per IP per minute. IPs are keyed hashes, not plaintext. Reverse proxies must supply the adapter's trusted client address correctly; the API uses Astro's `clientAddress` rather than accepting arbitrary forwarded headers itself. Inactive limit entries are pruned after 24 hours.

Address mail is sent after committing issuance. Delivery failure leaves the address usable and tells the donor to copy it. Same-session retries do not resend email. A process interruption during the send can leave `pending`; durable queued email retries are a future reliability improvement. Session tokens have no automatic expiry because an issued address may be funded much later. Clearing storage starts a new session; previously issued addresses remain in the manifest.

Verification links carry their token in the fragment, then remove it from browser history on load. An explicit same-origin POST consumes the token, so link prefetching alone cannot confirm an email. The confirmation page has no analytics.

## Styling

The saved preset is the default for API config. Install snippets explicitly set `preset="satsrecord|minimal|custom"` and copy escaped text into `heading`, `description`, `button` and `consent` slots. The component reads these as text, never as HTML. Custom starts with pale blue, soft blue and dark slate, and adds colour pickers for background, text/borders, buttons and button text; the snippet emits `--sr-background`, `--sr-text`, `--sr-accent` and `--sr-button-text`. The **Show “Powered by SatsRecord”** checkbox is enabled by default, saved with the widget config, and copied to the snippet as `show-branding="true|false"`. It controls the footer in every state. Manual CSS overrides still work. Changes to a pasted snippet require updating it on the charity's site. Saved Editorial configurations fall back to SatsRecord; newly added fields receive defaults without a database migration.

SatsRecord follows the house palette, square corners, two-pixel rules and hard shadow. Its Schibsted Grotesk variable font is served from `/widget/font.woff2`, with its OFL licence at `/widget/font-license.txt`. Minimal and Custom use system type by default; `--sr-font` can override it. No third-party font requests are made.

The QR generator is [uqr](https://github.com/unjs/uqr), pinned to 0.1.3 (MIT). Its licence notice is included in the served script. The centre-logo pattern follows the supplied bitcoin-serverless-donations reference: high error correction, a small logo and a white backing. The Bitcoin artwork is inline SVG, with its source licence in the bundle. There are no QR image requests or additional QR dependencies. The script is approximately 11.6 kB gzipped, below the 15 kB target; the font is loaded separately.

Buttons have restrained colour feedback on hover and respect reduced-motion preferences. Copy changes the button to **Copied!** for two seconds; a clipboard failure offers manual selection. The loading state reflects the real request, with a spinner and disabled controls. No artificial two-second delay is added: client-side delays do not constrain direct API spam; the server-side limits do. The no-email confirmation shares a grid area with the form, preserving its height and retaining entered values. Keyboard focus moves into the confirmation, and **Add my email** or Escape returns to email. Error messages remain visible when anonymous issuance fails.

## Verification completed

50 core tests pass. Type checks and the production build pass. The browser acceptance script passes against actual PostgreSQL, including concurrent retries, same-origin and cross-origin embeds, blocked storage, live status polling and email verification. Desktop and phone screenshots were inspected with no page overflow. Browser checks cover the anonymous confirmation without premature issuance or layout shift, colour/intro persistence, button hover/loading/copy feedback, and font loading. The logo-bearing QR was independently decoded with macOS Vision to the exact BIP21 URI. The local development database has migration 0006 applied.
