# Design decisions

How SatsRecord is built and why. Product scope is in [the brief](../project-brief.md); stack choices in [stack.md](stack.md). Decisions here are v1 commitments unless marked otherwise.

## Keys and derivation

**The descriptor is the storage format from day one.** Onboarding accepts:

| Pasted | Stored as | Addresses |
|---|---|---|
| zpub | `wpkh(<xpub>/0/*)` | bc1q |
| ypub | `sh(wpkh(<xpub>/0/*))` | 3... |
| xpub | script type is ambiguous: prompt, default `wpkh` | per choice |
| descriptor | as pasted, normalised | per descriptor |

Only the external chain (`/0/*`) is used; donations never touch change. `tr(...)` descriptors are accepted (bc1p). Legacy `pkh` is rejected with a message. `wsh(sortedmulti(...))` parses and validates so multisig charities can onboard, but issuance from it is gated until Core-backed derivation ships. Nothing migrates when it does.

**Confirm address 0.** After parsing, onboarding shows the first address and asks the charity to match it against its wallet. This catches wrong script type and wrong account cheaply.

**Fresh-account check.** Scan the first 20 indices through the chain source. Any history means the account is not fresh: warn, allow override, record the override.

**Derivation is server-side only.** The descriptor never reaches the browser. The widget requests an address; the server derives it. Single-sig via `@scure/bip32` and `@scure/btc-signer`. Multisig later via Bitcoin Core `deriveaddresses`, behind the same `Deriver` interface.

**Indices are never reused.** One monotonic counter per descriptor. Any served address may be paid weeks later, and reassigning it puts the wrong name on a tax document. Anonymous issues included: no attribution is not no recipient.

**Multiple descriptors per organisation.** A charity may rotate to a new account. Old descriptors stay watched; exactly one is active for issuance.

**Gap limit.** Donation widgets burn indices, so a wallet with a default gap limit of 20 will stop seeing funds after 20 consecutive unfunded issues. The manifest export and the dashboard both say "set your gap limit to at least N", where N is the highest index issued plus a margin.

## Issuance and the widget

**Derive on submit, not on page load.** Crawlers do not POST forms, and low-intent visitors do not burn indices. Name and email first (both optional), then the address.

**Session handling.** Server-side session token plus `localStorage`, keyed per organisation. Same session: same address until it is funded. New session: new address. On load, the widget asks the server whether the cached address is funded. If it is, the widget shows "Received, thank you" (no amount) and offers a fresh address.

**Abuse limits.** Issuance is rate-limited server-side per origin and per IP. Identical name and email submissions get separate rows and separate addresses, so nobody can discover the address another donor was given.

**Allowed origins.** The charity lists the domains its widget may run on. The API enforces this on the `Origin` header; the widget script is served with the org's config.

**Shape.** One custom element plus one script tag, no framework dependency, target under 15 kB gzipped including QR generation. States: form → address (QR, copy, BIP21 URI) → received. Customisation via CSS custom properties and escaped text slots.

**The email carries the address**, so a donor can pay later from a hardware wallet without keeping the tab open.

## Detection

Three timestamps, recorded separately: `first_seen_at` (mempool), `block_time`, and `confirmations_at_valuation`.

- **First seen** at mempool detection. Recorded, not acted on.
- **Receipt** is one confirmation. This triggers acknowledgement.
- **Block time is canonical for valuation.** Detection time is our polling latency; block time is reproducible by an auditor.

**Chain sources** implement one interface: mempool.space REST (self-host default, with a privacy warning) and Bitcoin Core RPC (hosted, always). A fake in-memory source is the test double and drives the demo.

**Polling.** Issued, unfunded addresses are polled on a schedule with backoff by age. Funded addresses are still re-checked: two payments to one address are one donor, two settlements, two dates, two FMVs. US thresholds apply per contribution.

**Reorgs.** A settlement that disappears is amended, never deleted.

## Valuation

Source: Kraken public API. Pair: XBT against the charity's reporting currency. Every valuation row stores source, pair, timestamp, method, rate and the resulting amount in reporting currency, immutably.

v1 method: close of the 1-minute OHLC candle containing `block_time`, fetched at detection. Late detection (beyond Kraken's 1-minute window) falls back to the daily candle, recorded as a distinct method string. Sources are pluggable; Kraken is the default, not a dependency.

## Attribution integrity

Every donor record carries `claimed | email_confirmed`, and any rendered document says which.

**Verification never gates the address.** Submit → address shown and emailed → that email carries the verification link. Still unverified at confirmation, and the acknowledgement carries the link instead. Someone entering a stranger's details gets nothing: the stranger does not click, the status stays `claimed`. A "this wasn't me" path is deferred (see brief, Open).

**Marketing consent** is an unticked opt-in. The consent row stores the timestamp and the version of the label text shown.

## Data model

**Append-only, with one exception.** Settlements, valuations and acknowledgements are never updated. Corrections (wrong name, reorg, donor asks to be anonymised) are amendments: a new row superseding the old, with `amended_by`, template version and reason.

**Erasure is the exception, and it is why donor PII gets its own table.** An amendment supersedes without erasing, which is the opposite of what an erasure request demands. The append-only chain holds a `donor_id`; deleting the donor row leaves every settlement, valuation and acknowledgement intact, queryable and unattributed. Email send logs store `donor_id` and the provider message id, never the address. Retrofitting this means migrating exactly the tables that are hardest to migrate, so it is a v1 schema decision.

**Email lookup without plaintext.** PII is encrypted at the application layer, so donor lookup by email (erasure requests, support) goes through a blind index: HMAC of the normalised address.

**Settlement is polymorphic.** `kind: onchain | lightning`, `ref: txid:vout | payment_hash`. Lightning (v2) adds a kind, not a table.

**Organisations and members.** An organisation has members with a `role` column. v1 has one role in practice; the column exists so approval flows can be added without migration.

**Jurisdiction is an output layer.** Every settlement stores the US superset (asset, date, FMV, txid, donor details, charity registration number, goods-or-services flag). Renderers per jurisdiction come later; v1 renders a generic acknowledgement.

## Email

Three transactional emails in v1: address issued (with verification link), acknowledgement on receipt, and auth magic links. Plus access-request and invite emails for the hosted flow.

**Sender identity.** v1 sends from the SatsRecord domain as `<Charity Name> via SatsRecord`, with `Reply-To` set to the charity. Branded sending from the charity's own domain (DKIM and Return-Path delegation) is a later feature; the sender-identity model exists from day one so it is additive.

**Templates are versioned**, and the version is recorded on every acknowledgement row, because the brief requires an auditable record of what was sent.

Provider sits behind a `Mailer` interface: Resend for hosted, SMTP for self-host, console for development.

## Security

- Descriptors and PII encrypted at rest at the application layer (AES-GCM), key from environment now, KMS later. Database encryption in addition, not instead.
- Descriptors never leave the server and are never sent to a third-party API. Addresses go to mempool.space only on self-host, and only after the privacy warning.
- Authentication is passwordless: magic link plus passkeys.
- Rate limiting on issuance and on auth endpoints.

## Process model

One codebase, two roles: `web` (site, app, widget API) and `worker` (polling, valuation, acknowledgement). Hosted runs them as separate processes; self-host defaults to a single process running both. The worker does not exist until the full build; its interfaces do.

## Open (technical)

- Kraken fallback detail for late detection, and whether to snapshot a rate at `first_seen_at` as a hint.
- Multisig derivation: Core `deriveaddresses` vs a TypeScript miniscript library.
- Job scheduling in the worker: Postgres-backed queue vs a plain loop. Decide at Phase 7.
