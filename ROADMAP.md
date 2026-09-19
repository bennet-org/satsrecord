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
- [x] Wallet guides: Sparrow, Coldcard, Ledger, Trezor, BlueWallet (links to begin with)
- [x] Email sender: display name, reply-to
- [x] Allowed origins
- [x] Finish: install snippet

**Acceptance:** a Sparrow-exported zpub yields addresses matching Sparrow, and a used account triggers the warning. Implemented 18 September 2026; automated vectors and local wizard walkthrough pass. User approved committing Phase 3 on 19 September 2026. See [testing checklist](docs/onboarding-testing.md).

## Phase 4: dashboard

- [ ] Donations list and detail (settlement, FMV, attribution status, audit trail)
- [ ] Donors list and detail; erasure action
- [ ] Exports: CSV; address manifest with gap-limit guidance
- [ ] Widget page: snippet, live preview, CSS variable and text-slot customisation
- [ ] Settings: organisation, wallet, email, origins, team

**Done when:** every page renders against seeded data.

## Phase 5: widget

- [ ] Web component: form → address (QR, copy, BIP21) → received
- [ ] Submit → server derives → address email with verification link → verification recorded on click
- [ ] `localStorage` and session token; funded check on load; rate limits; origin enforcement
- [ ] Built and served from `apps/web` at a versioned path

**Done when:** embedded in a plain HTML page on another local port, it serves a real address and emails it.

## Phase 6: demo polish

- [ ] Simulate-donation action → settlement, valuation (fixed rate), acknowledgement email, widget received state
- [ ] Seed script; `pnpm demo` brings everything up
- [ ] `docs/demo.md`: the five-minute walkthrough to show a charity
- [ ] README, AGPL-3.0 (app) and MIT (widget) licence files

**Done when:** the walkthrough runs clean from a fresh clone.

## Decision gate

Show the demo to prospects. Proceed → Phase 7.

## Phase 7: chain backend

- [ ] `apps/worker` entrypoint; `ChainSource` implementations: mempool.space REST, Bitcoin Core RPC
- [ ] Polling scheduler with backoff; multiple settlements per address; reorg → amendment
- [ ] `RateSource`: Kraken, method recording, late-detection fallback
- [ ] Acknowledgement on first confirmation, for real
- [ ] Hosted node

## Phase 8: hosted launch

- [ ] Hosting: web on Netlify from Phase 2; worker and node on a box (Fly or similar) with Cloudflare in front, web moves there if it simplifies things. Neon, backups, DNS.
- [ ] ICO registration, DPA template, retention and deletion policy
- [ ] First design partners invited

## Phase 9: hardening

- [ ] Amendments UI; erasure UI; "this wasn't me"
- [ ] Optional charity-branded email sending via DNS verification; verified From addresses, delivery events and safe fallback. [Scope](docs/branded-email.md).
- [ ] Multisig issuance via Core `deriveaddresses`
- [ ] Jurisdiction renderers, US acknowledgement letter first
- [ ] CRM exports, two, chosen by design partners

## Later

Self-host packaging and docs. Billing. Lightning via NWC. EU prescribed forms.
