# SatsRecord: project brief

Self-custodial, bitcoin-only donation tooling for charities and non-profits. Better privacy than a static address, the records and exports a compliance team needs, receipts and acknowledgements for donors, and none of the fees or custody of a payment processor.

This is the product brief: who it is for, what it does, what it will not do. Technical decisions are in [docs/design.md](docs/design.md), the stack in [docs/stack.md](docs/stack.md), the plan in [ROADMAP.md](ROADMAP.md), and brand in [brand/README.md](brand/README.md).

## Premise

Most charities that accept crypto want it converted to fiat immediately and have no interest in running a wallet or any infrastructure. A smaller group either holds donated bitcoin as a treasury asset, or would receive to a wallet it controls if that removed processor fees and custodian dependence, converting to fiat on its own terms. Our thesis: this group is under-served and growing.

Today it has three options:

- **A static address.** Poor privacy: every donation is publicly linkable. Acknowledgement, receipting and record-keeping are manual.
- **BTCPay Server** or similar. Considerable infrastructure burden. No charity-specific receipting or donor records.
- **The Giving Block** or similar. Custody of the coins and exclusive control of donor records are both surrendered. Often expensive.

SatsRecord is built for this group.

**Who is in scope.** The segmentation line is custody at receipt: a charity that receives bitcoin at an address it controls. Hold, hold-then-sell, and sell-on-arrival from own custody are all in. Only handing donors a processor's address is out, and that is a board decision rather than a vendor one.

## What it is

Open core. An open-source repository that a technical organisation can self-host with no trust in or dependency on us, alongside a hosted, paid service where we run everything.

**Hosted.** Onboarding needs one thing from the charity: an extended public key (xpub) from a fresh wallet account, or a multisig descriptor once supported. The charity gets an embeddable widget for its own site. A donor who shows intent submits the form (name and email both optional) and is issued a fresh, never-reused address, shown in the widget and emailed to them. SatsRecord watches issued addresses from its own node, so no address is leaked to a third party. On first confirmation, the donor is emailed an acknowledgement carrying fair market value at block time, and the donation is logged to the charity's records with FMV and donor details, ready for reports and exports. Optionally the charity adds DNS records so email is sent from its own domain.

**Self-hosted.** The same application, run by the charity. It maintains its own node (or points at mempool.space, with a privacy warning) and keeps the service running.

## Scope

The core loop: **address → attribution → detection → valuation → acknowledgement → exports and reports.**

**Never custodial, never fiat.** SatsRecord never holds a key that can sign, never takes custody, routes, converts or touches fiat. This keeps it outside money transmission, MiCA and FCA registration.

**On-chain only in v1.** Lightning is v2, and only with the charity's own NWC credential scoped to `make_invoice` and `lookup_invoice`. Settlement is polymorphic from day one (`txid:vout` or payment hash), so Lightning is additive.

## Core features (v1)

1. **Donor attribution.** The widget invites name and email, both optional, plus an unticked marketing opt-in whose label the charity can edit. Blank fields mean a fully anonymous donation, which is still recorded.
2. **xpub or descriptor.** Charities paste an xpub, ypub or zpub and we handle the rest. Descriptors are accepted from day one. Multisig descriptors are recognised but gated until supported: a bare xpub means one person can move the charity's money, and multisig is the answer while staying watch-only.
3. **Fresh-account check and wallet guides.** Getting a fresh xpub out of wallet software is the one hard step. Onboarding scans the first indices and warns if the account has history, confirms address 0 against the charity's wallet, and ships step-by-step guides for Sparrow, Ledger, Trezor and BlueWallet.
4. **FMV pinned at receipt** in the charity's reporting currency, sourced from Kraken, stored immutably with the settlement.
5. **Acknowledgement email** on first confirmation. Attribution status (`claimed` or `email_confirmed`) is shown on every rendered document.
6. **Address manifest export.** Every index ever issued, with "set your gap limit to at least N" guidance. This is the anti-lock-in guarantee: if we disappear, the charity recovers everything from the manifest and its own seed.
7. **CSV export** of donations and donors. CRM integrations later.
8. **Organisations with members.** One admin sets up and invites colleagues. Roles and approval flows come later, but the data model supports them from day one because three people are typically involved: finance sets it up, fundraising uses it, a trustee approves it.

## Deployment and business model

**Hosted is the v1 product.** Invite-only: the site takes access requests and we issue invites. Billing is deferred, but this is the paid tier. What it buys is that we carry the data protection burden and run the node. Pricing: a flat monthly fee, figure not yet fixed and not published, possibly tiered by charity size later but never scaled by donations received. Waived for charities that can't afford it, and free for everyone during the pilot.

**Self-hosted exists but is unsupported in v1.** Open core means a repo, a licence and basic run instructions from day one; docs, an upgrade path and issue triage do not. All onboarding effort goes to hosted. Shipping self-hosted only would serve exactly the audience BTCPay already serves, with fewer features, and would never test onboarding.

**Licence.** AGPL-3.0 for the application. MIT for the embeddable widget, so charities can drop it into any site without licence questions.

## Onboarding

The main product risk. It requires someone technical enough to get an xpub or descriptor out of wallet software, and it must be a fresh account. Everything else should take minutes, and be far easier than BTCPay.

## Compliance

**No financial regulation**, because we never touch funds. FinCEN guidance exempts non-custodial wallet software, including multisig providers who cannot unilaterally execute; MiCA treats non-custodial wallets as non-custodians; the FCA registers neither exchange nor custodian wallet providers. Watch-only cannot sign, so this sits well inside the line.

**Data protection is the main cost.** Donor PII makes us a processor with each charity as controller. The paperwork is cheap and reversible: ICO registration (about £52/yr), a DPA template, a retention and deletion policy, and a decision on whether an Article 27 representative is needed. Data subjects are donors, not charities: "US and UK design partners only" defers EU establishment, but does not by itself keep EU residents out of the database.

Descriptors and donor PII are encrypted at rest and never sent to a third-party API. A leaked descriptor is the charity's complete donation history, permanently linked.

Security questionnaires and Cyber Essentials are the expensive items. They arrive with large-charity procurement, not with the pilot. US state privacy laws carry thresholds we will not meet initially.

## Jurisdictions

US, UK, EU. The prospect list is mostly American: OpenSats and HRF are both 501(c)(3)s.

Core is jurisdiction-agnostic; jurisdiction is a pluggable output layer. Derivation, attribution, detection, valuation, storage and email do not vary by country. Receipt content, thresholds and report format do.

**Store the superset now, render later.** A field not captured at receipt cannot be recovered. The US regime is the most demanding ($250 written acknowledgement, $500 Form 8283, $5,000 appraisal), so satisfying it satisfies the others: asset, date, FMV in reporting currency, txid, donor details, charity registration number, and whether goods or services were provided.

UK: Gift Aid is out, since HMRC does not treat cryptoassets as money. Donating crypto direct to a charity is no-gain-no-loss for CGT, a real donor incentive but true of crypto donation generally, so content rather than USP.

"EU" is not one market. GDPR is EU-wide, receipting is not: Zuwendungsbestätigung, CERFA and ANBI are separate prescribed forms. US and UK first, EU generic until a member state earns the work.

## Funding

Grants are the primary path. OpenSats has allocated about $21.6m to 252 grantees at roughly $1m/month; HRF's Bitcoin Development Fund $9.6m across 319 projects since 2020 (figures at time of writing). That is $30–100k/yr territory for a credible, maintained FOSS project, which a hosted fee would need dozens of paying orgs to match, without the support, uptime and data protection duties attached.

Open source is therefore a qualification criterion, not a nice-to-have.

## Positioning

Provisional name **SatsRecord**. satsrecord.com and satsrecord.org are held. Name, strapline, visual identity and the public comparison belong in [brand/README.md](brand/README.md).

- **Not BTCPay.** BTCPay has a crowdfund app, accounting exports, watch-only xpub setup, Miniscript and a GiveWP integration. It is also a Docker host, a database and ongoing ops, and it gives you a transaction list, not a donor record.
- **Not The Giving Block or Engiven.** Custodial processors taking a cut.
- **Not Koinly or Recap.** Tax tooling with no donor dimension.

SatsRecord is built for charities, and the hosted version is far easier to set up.

## Open

- **CRM export targets.** Donorfy and Beacon (UK), Salesforce NPSP and Bloomerang (US). Design partners pick two.
- **Gift acceptance.** Source of funds when a donation arrives from an exchange; returned or refused gifts.
- **"This wasn't me" path** for donors whose details were entered by someone else. Probably needed; not v1.
- **Branded email sending** from the charity's own domain via DNS delegation. Planned; not v1.
