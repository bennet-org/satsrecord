# SatsRecord brand

The marketing site lives in `apps/web`. This document is the brand reference it is built from. Logos for the comparison table: `btcPayServer.svg`, `theGivingBlock.svg` (copied to `apps/web/public/logos/`).

## Direction

A poster. Full bitcoin-orange ground, black type, paper-coloured record card with a hard black shadow, two-pixel rules. Sections alternate orange, paper, orange, paper, orange, and close on black with orange type.

The orange works only because everything else is austere. No gradients, no rounded corners, no icons, no ₿ glyph, no coin imagery, one typeface. Keep that discipline or the page becomes a bitcoin site.

Proposed split: the orange ground is for the marketing site. The app (dashboard, onboarding, emails) runs on paper and black with orange as a small accent, so finance staff work in a calm UI.

## Type

Schibsted Grotesk throughout. Weights 400, 500, 700, 800.

| Role | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| H1 | 116px (96px if over 36 chars) | 800 | -0.045em | 0.98 |
| H2 | 72px | 800 | -0.045em | 0.92 |
| Closing line | 96px | 800 | -0.045em | 0.92 |
| Price / step numerals | 56–72px | 800 | -0.045em | 1 |
| Lead paragraph | 24px | 500 | 0 | 1.3 |
| Section paragraph | 20px | 500 | 0 | 1.4 |
| Body | 15–16px | 500 | 0 | 1.45 |
| Labels | 12–14px | 700–800 | 0.08em, uppercase | 1 |

Body copy is set at weight 500, not 400, so it holds against the ground.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ground` | `#F7931A` | Page ground |
| `--ink` | `#101010` | Type, rules, buttons, closing ground |
| `--paper` | `#FFF7EA` | Record card, paper bands |
| `--paper-ink` | `#101010` | Type on paper |
| `--paper-mute` | `#6B5A3C` | Secondary text on paper |
| `--paper-hair` | `#D9C9AE` | Hairlines on paper |

Black on the orange measures about 8.6:1. Cream on orange fails, so type on the ground is always black.

## Wordmark

`SatsRecord`, one word, capital S and R, Schibsted Grotesk 800, -0.03em. No symbol yet; a plain black square stands in where a mark is needed.

## Copy in use

- Headline: **Accept bitcoin without the middleman.**
- Lead: No processors taking a cut. Donors pay a wallet you control, and every gift is automatically recorded, valued and acknowledged.
- Closing and footer line: **You hold the keys. We do the paperwork.**
- Descriptor: Non-custodial bitcoin donations for charities and non-profits.
- Four hero facts: We can't touch funds. Donor data stays yours. Your setup outlives us. Open source.

## Page order

1. Hero: headline, lead, two buttons, record card, four facts.
2. Who it's for (paper): "Bitcoin donations for charities and non-profits", custody-at-receipt paragraph, Finance / Fundraising / Trustees.
3. How it works: six numbered steps.
4. Compared (paper): four options as rows, five criteria as columns, SatsRecord row filled orange.
5. Pricing: two tiers, self-hosted free and hosted at $149/month, waived for smaller charities and free during the pilot. Prices in USD.
6. Close (black): spine line, invite-only note, request access, footer.

## Fictional record

Gift 0041, block 912,344, 14 September 2026 10:42 UTC, 0.0125 BTC, $815.20, Kraken XBT/USD, template v3. USD throughout the marketing site; the prospect list is American. Use the same numbers anywhere a sample record appears.

