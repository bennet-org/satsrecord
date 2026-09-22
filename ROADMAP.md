# Roadmap

Demo first, chain backend second.

Phases 0–6 produce a locally runnable product: marketing site with access requests, invite and passwordless login, onboarding with real address derivation, dashboard, and a widget that serves real addresses. Detection and valuation are stubbed behind their interfaces; a dev-only action simulates a donation so acknowledgement, records and exports can be shown end to end. Phase 7 onward is the full build, gated on the decision to proceed.

**Reuse rule:** everything in Phases 0–6 ships in production unchanged. Anything that would not is out of scope for the demo.

## Phase 0: foundations

- [x] Brief, design and stack docs
- [x] Brand discussion → `brand/README.md`: name confirmed, strapline, palette, type, tone, comparison table copy
- [x] Scaffold: pnpm workspace, `apps/web` (Astro 7, Tailwind 4), `packages/core`, `packages/widget`, Dockerfile, compose Postgres. React and shadcn arrive with the first interactive page.
- [x] Schema v1 and migrations: access_requests, descriptors, addresses, submissions, donors (PII), consents, settlements, valuations, acknowledgements, amendments, email_log. Organisations, members and member invitations come from Better Auth's organization plugin in Phase 2; operator invites are our own table.
- [x] Encryption helper; `ChainSource` and `RateSource` fakes; `Deriver` with single-sig implementation and descriptor parser. (`Mailer` with Resend and console implementations shipped with Phase 1; SMTP arrives with self-host packaging.)

**Done when:** `pnpm dev` runs, migrations apply, tests derive address 0 from known zpub, ypub and `tr` vectors. Done 16 September 2026: BIP84, BIP49 (testnet upub) and BIP86 spec vectors pass.

## Phase 1: marketing site

- [x] One page: hero, who it's for, how it works, comparison, pricing, closing
- [x] Request access form → `access_requests` row + notification email
- [x] Privacy and terms placeholders, 404 page

**Done when:** reads well at phone width, request access stores a row and sends the email.

## Phase 2: auth and organisations

- [x] Better Auth: magic link login, passkey enrolment prompt after first login
- [x] Invite flow: operator issues invite (`/admin`, gated by `OPERATOR_EMAILS`) → magic link from the invite page → organisation created, user is owner
- [x] Team page: invite, list, remove members, cancel invitations
- [x] `OPEN_SIGNUP` path (`/signup` → `/app/new`) and a dev outbox at `/dev/outbox`

**Done when:** cold start to logged-in organisation in under two minutes using the console mailer. Done 16 September 2026: invite from `/admin`, two links from the outbox, organisation and team page. Uninvited addresses get no email; magic links are limited to 5 a minute per IP.

## Phase 3: onboarding

- [x] Organisation: name, registration number, country, reporting currency
- [x] Wallet: paste xpub/ypub/zpub/descriptor → normalise → script-type prompt for bare xpub → confirm address 0 → fresh-account check (fake source in demo; live source deferred)
- [x] Wallet guides: Sparrow, Ledger, Trezor, BlueWallet (links to begin with)
- [x] Email sender: display name, reply-to
- [x] Allowed origins
- [x] Finish: install snippet

**Acceptance:** a Sparrow-exported zpub yields addresses matching Sparrow, and a used account triggers the warning. Implemented 18 September 2026; automated vectors and local wizard walkthrough pass. User approved committing Phase 3 on 19 September 2026. See [testing checklist](docs/onboarding-testing.md).

## Phase 4: dashboard

- [x] Donations list and detail (settlement, FMV, attribution status, audit trail)
- [x] Donors list and detail; erasure action
- [x] Exports: CSV; address manifest with gap-limit guidance
- [x] Widget page: snippet, live visual preview, CSS variable and text-slot customisation
- [x] Settings: organisation, wallet, email, origins, team. Wallet is read-only; replacing it goes through hello@satsrecord.org, and addresses already issued stay monitored.

**Done when:** every page renders against seeded data. Implemented 19 September 2026: desktop and phone walkthrough, CSV downloads, settings and erasure verified. Widget preview is visual; issuance and delivery remain Phase 5. See [testing checklist](docs/dashboard-testing.md).

## Phase 5: widget

- [x] Widget design pass: SatsRecord brand styling, Minimal, and Custom with colour controls; editable intro text and previews for each donor step.
- [x] Web component: form → address (QR, copy, BIP21) → received
- [x] Submit → server derives → address email with verification link → verification recorded on click
- [x] `localStorage` and session token; funded check on load; rate limits; origin enforcement
- [x] Built and served from `apps/web` at a versioned path

**Done when:** embedded in a plain HTML page on another local port, it serves a real address and emails it. Implemented 19 September 2026: production-server cross-origin walkthrough, email verification, session restoration, received/new donation states and desktop/phone presets pass. See [testing checklist](docs/widget-testing.md).

## Phase 6: demo polish

- [x] Simulate-donation action → settlement, valuation (fixed rate), acknowledgement email, widget received state. Implemented 21 September 2026 at `/dev/donations`; see [simulation testing](docs/demo-testing.md).
- [x] Charity donation notifications: per-organisation opt-in, per donation or daily digest, to the owner or a chosen address; sent from the settlement path alongside the acknowledgement
- [x] Seed script; `pnpm demo` brings everything up
- [x] `docs/demo.md`: the five-minute walkthrough to show a charity
- [x] README, AGPL-3.0 (app) and MIT (widget) licence files

**Done when:** the walkthrough runs clean from a fresh clone. Implemented 21 September 2026: empty isolated database startup, repeat startup, browser walkthrough, CSV exports, desktop/phone layouts and production guards verified. `pnpm demo` seeds and starts the local demo; see [the walkthrough](docs/demo.md).

## Decision gate

Show the demo to prospects. Proceed → Phase 7; agree pilot partners, supported reporting currencies and whether any Phase 9 feature is a launch prerequisite.

## Phase 7: live donation loop

Boundary: on-chain, single-sig, Bitcoin Core; generic acknowledgements. Prove recovery locally before hosting real donations.

- [ ] `apps/worker` and Core `ChainSource`: choose watch-only imports/indexing, cover every issued index, persist scan checkpoints and recover missed history. Live first-20-address onboarding check, including spent history; unavailable checks must not report a fresh wallet.
- [ ] Durable scheduling: choose Postgres jobs or a checkpointed loop; backoff, concurrency control and restart recovery. Watch funded and retired addresses too; deduplicate by `txid:vout`, keep separate payments separate, distinguish observed time from block time.
- [ ] Settle at three confirmations; below that, nothing is recorded and the widget shows the payment as seen. The scanner survives tip reorgs without missing or duplicating payments. A settled transaction that later leaves the chain alerts the operator and freezes the record; manual correction until Phase 9.
- [ ] Kraken `RateSource`: validate supported currency pairs and rounding, store provenance, use the completed minute candle at block time and a labelled daily fallback for late detection. Define historical coverage; missing rates leave a visible, retryable valuation pending without losing the payment. [API constraints](https://docs.kraken.com/api-reference/market-data/get-ohlc-data).
- [ ] Settlement queues acknowledgement, sent once valuation is ready; durable retries and provider idempotency/reconciliation, including a crash after sending. Worker owns charity notices and digests.

**Done when:** Core regtest proves receipt → valuation → email → widget/dashboard/export, including anonymous donations, repeated payments, restart catch-up, reorgs either side of settlement and rate/mail outages; replays produce no duplicate records or sends. Exercise the live rate adapter separately against supported currencies.

## Phase 8: hosted pilot

Boundary: invite-only, free pilot with operator support; generic acknowledgements unless the decision gate brings a jurisdiction renderer forward.

- [ ] Deploy worker and synced Core node with private RPC; retain Netlify/Neon unless moving web simplifies private connectivity. Configure DNS, secrets, migrations and rollback; production must reject demo adapters.
- [ ] Monitor node/scan lag, pending valuations and mail failures; agree alert thresholds and recovery targets. Restore database, encryption/index keys and watch state in a drill, then catch up without reissuing addresses or duplicating mail.
- [ ] Verify organisation isolation, issuance abuse limits and operator permissions; exercise transactional delivery, bounce/complaint suppression and failure visibility with the standard SatsRecord sender.
- [ ] Replace privacy/terms placeholders; ICO registration, DPA, subprocessor/transfer and EU-representative assessment, retention/deletion policy with working erasure and backup handling. Publish a support route for attribution disputes before self-service exists.
- [ ] Operator wallet rotation in `/admin`: verify the replacement, switch issuance atomically, audit the change and keep retired addresses watched. Existing submissions retain their issued address; new submissions use the new descriptor; indices are never reassigned.
- [ ] Invite first design partners after readiness checks; verify wallet recovery from the manifest, a small real donation, acknowledgement delivery and reconciled CSV export with them. Record onboarding friction and prioritise Phase 9 from actual needs.

**Done when:** at least one partner completes the live loop on its own site; restore/catch-up and alert drills pass, a rotation preserves old-address receipts, and pilot support and data-protection arrangements are in place.

## Phase 9: partner-led product depth

Sequence by partner need; each addition ships independently on the Phase 8 reliability baseline.

- [ ] Correction authoring and “this wasn't me”: authorised, reasoned amendments, corrected outputs and donor identity checks; preserve history without restoring erased PII (erasure shipped in Phase 4).
- [ ] Multisig via Core `deriveaddresses`: activate supported `wsh(sortedmulti(...))` descriptors through onboarding, issuance, monitoring and manifest export; match a reference wallet across multiple indices. No signing or custody.
- [ ] US acknowledgement renderer first: agree required organisation/donation fields and goods-or-services capture, review wording, version templates and verify original/corrected letters. Generic output remains available; tax filing and appraisals are outside scope.
- [ ] Optional charity-branded email: verified From addresses, DNS setup, test send and safe fallback on lost verification; reuse Phase 8 delivery handling. [Scope](docs/branded-email.md).
- [ ] Two partner-chosen CRM export formats: agree mappings and stable identifiers, then verify imports of anonymous, amended and erased records. File exports only; ongoing synchronisation is separate scope.

**Done when:** each shipped addition passes its failure cases and a partner walkthrough; the two CRM formats import into their target systems and jurisdiction output has documented content review.

## Later

Uncommitted; promote an item only with a user need and a bounded acceptance target.

- **Self-host distribution:** versioned web/worker packaging, SMTP, Core or mempool.space (explicit address-privacy warning), setup/upgrade/backup docs; prove clean install and upgrade with data retained. Basic repo run instructions already exist.
- **Billing:** after pilot pricing/waiver validation; subscriptions, entitlement and failed-payment policy that preserves records, exports and monitoring of issued addresses. Prove signup, cancellation and recovery before charging.
- **Brand-matched widget:** website → suggested existing style controls → preview → explicit apply; manual controls remain available. Accept when the result is readable, editable and reversible.
- **Lightning via NWC:** separate scope for invoice lifecycle, least-privilege credentials, valuation and recovery; prove the same record/export loop without custody before release.
- **EU prescribed forms:** one named jurisdiction at a time, driven by a partner and reviewed local requirements; capture missing fields before promising compliant output.
