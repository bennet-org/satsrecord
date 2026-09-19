# Phase 3: test the onboarding wizard

Run the local database migration with `pnpm --filter @satsrecord/core db:migrate`, then `pnpm dev`. Astro reads the web app's environment from `apps/web/.env`; make sure `ENCRYPTION_KEY` and `INDEX_KEY` are distinct base64-encoded 32-byte keys. Keep existing keys unchanged once any wallet has been saved.

Sign in to your organisation and open `/app/setup`. Each successful step saves to the database; closing the page and returning resumes progress. Owners and admins can complete setup. The wizard is mainnet-only; simulation works with derived mainnet addresses without moving real bitcoin. Core derivation still supports testnet.

1. Enter organisation details. Registration number is optional; country and reporting currency are required.
2. Paste a fresh account's zpub exported from Sparrow. Compare address 0 with Sparrow's receiving address list. A bare xpub asks for its script type; zpub, ypub and supported single-signature descriptors infer it. Private keys, testnet keys, legacy scripts and multisig issuance are rejected with an explanation. Wallet input is never echoed back into the page.
3. Confirm the first address, then set sender name and reply-to email.
4. Enter allowed website origins, one per line. `https://example.org` and `http://localhost:8080` work. Paths, wildcards, remote HTTP and credentials are rejected. Repeated origins are deduplicated.
5. Review, finish and copy the install snippet. Reloading or double-submitting finish does not create another active descriptor. Dashboard links back to the completed setup. Settings editing and wallet rotation arrive in Phase 4.

Before finishing, try Back, page reload and opening another tab. Replacing the wallet must require address confirmation again; an old tab must not confirm a newer wallet draft.

## Used-account warning

Set `SIMULATE_DONATIONS=true` in `apps/web/.env` and run the development server. On the wallet confirmation screen, use **Simulate existing account history**. Check both the address-match and history-override boxes to continue. Review shows “existing history accepted”, and the active descriptor records the override.

This fixture is development-only, scoped to that request, and does not fund a real address. The fake source checks the first 20 addresses; it does not inspect the real blockchain, even for a genuinely used zpub. No wallet data is sent to an external service. The donation simulation action and records flow are Phase 6 work, distinct from this history-warning fixture.

## Reproducible public test vector

For a quick UI smoke test without Sparrow, use this BIP84 public vector (publicly known wallet; never send funds):

```text
zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs
```

Expected address 0:

```text
bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu
```

The snippet reserves `/widget/v1.js` and `<satsrecord-donate org="…">`; serving and implementing it is Phase 5. Completing setup does not yet enable donations.

Automated verification: `pnpm test`, `pnpm check`, `pnpm build`. Core tests cover encrypted drafts, the BIP84 address, explicit script choice, stale confirmation, index-19 history, explicit override, unavailable chain source, incomplete setup, organisation separation, input rejection and idempotent activation.
