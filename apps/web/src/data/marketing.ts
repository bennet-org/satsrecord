import BtcpayLogo from "../assets/logos/btcpay.svg";
import GivingBlockLogo from "../assets/logos/the-giving-block.svg";
import SatsRecordMark from "../assets/brand/mark.svg";
import type { GlyphName } from "../components/Glyph.astro";
import { walletGuides } from "./wallets";

export const site = {
  name: "SatsRecord",
  title: "SatsRecord: Bitcoin donations for charities and non-profits",
  descriptor: "Non-custodial bitcoin donations for charities and non-profits.",
  spine: "You hold the keys. We do the paperwork.",
  sourceUrl: "https://github.com/bennet-org/satsrecord",
  domain: "satsrecord.org",
};

export const nav = [
  { label: "How it works", href: "/#how" },
  { label: "Compared", href: "/#compared" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/faq/" },
  { label: "Sign in", href: "/login" },
];

export const hero = {
  headline: "Accept bitcoin without the middleman.",
  lead: "No processors taking a cut. Donors pay a wallet you control, and every gift is automatically recorded, valued and acknowledged.",
  facts: [
    {
      glyph: "keys",
      title: "We can't touch funds.",
      body: "Watch-only. We derive addresses from your public key and hold nothing that can sign.",
    },
    {
      glyph: "ack",
      title: "Donor data stays yours.",
      body: "Encrypted at rest, exportable, deletable on request. Never sold, never used for anything else.",
    },
    {
      glyph: "csv",
      title: "Your setup outlives us.",
      body: "If we vanish, your wallet still sees every gift, and your exports are yours.",
    },
    {
      glyph: "source",
      title: "Open source.",
      body: "AGPL-3.0. Self-host it, audit it, or let us run it for you.",
    },
  ] as Array<{ glyph: GlyphName; title: string; body: string }>,
};

/** The one fictional record used everywhere a sample appears. */
export const sampleRecord = {
  id: "Gift 0041",
  status: "Confirmed",
  rows: [
    ["Donor", "A. Donor · email confirmed"],
    ["Block time", "14 Sep 2026, 10:42 UTC"],
    ["Amount", "0.0125 BTC"],
    ["Value at block", "$815.20", "big"],
    ["Price source", "Kraken XBT/USD"],
    ["Acknowledgement", "Sent · template v3"],
  ] as Array<[string, string, string?]>,
};

export const whoFor = {
  heading: "Bitcoin donations for charities and non-profits.",
  body: "Built for organisations that receive bitcoin at an address they control. Whether you hold it as a treasury asset or sell it, the gift goes straight from the donor to your wallet.",
  roles: [
    [
      "record",
      "Finance",
      "A record per gift with value at block time, the price source, and the acknowledgement that was sent. CSV out.",
    ],
    [
      "widget",
      "Fundraising",
      "A widget on your site. Donors get a fresh address and an acknowledgement, and stay on your list, not someone else's.",
    ],
    [
      "keys",
      "Trustees",
      "No custody, no conversion, no money transmission. Open source, so the claims can be checked.",
    ],
  ] as Array<[GlyphName, string, string]>,
};

export const steps = [
  [
    "Paste a public key",
    "From a fresh account in your wallet. We check it's unused, show you the first address to confirm, and never ask for anything that can sign.",
  ],
  [
    "Add one script tag",
    'The widget sits on your donate page. A donor clicks "Give", adds a name and email if they want, and gets a fresh address on screen and by email.',
  ],
  [
    "Watch it arrive",
    "Detection from our node or yours. Value pinned at block time in your currency. Acknowledgement sent on first confirmation, and the gift filed in your records.",
  ],
  [
    "Export anything",
    "Donations and donors as CSV. Every address ever issued as a manifest for your wallet. CRM feeds when you want them.",
  ],
  [
    "Correct without erasing",
    "Wrong name, reorg, a donor asking to be anonymised. Corrections are amendments that point back at what they replace.",
  ],
  [
    "Leave whenever",
    "The manifest and your seed recover everything. Or run the open-source version yourself and stop paying us.",
  ],
];

export type Cell = { text: string; muted?: boolean };
const c = (text: string, muted = false): Cell => ({ text, muted });

export const compared = {
  intro: "Ways a charity can accept bitcoin today, and the trade-offs of each.",
  columns: [
    "Who receives the coins",
    "Donor record",
    "Tax acknowledgement",
    "Setup and upkeep",
    "Fiat conversion",
  ],
  options: [
    {
      name: "A static address",
      sub: "One address, reused",
      logo: "dots",
      cells: [
        c("You"),
        c("None, just a transaction list", true),
        c("By hand", true),
        c("None"),
        c("No", true),
      ],
    },
    {
      name: "BTCPay Server",
      sub: "Self-hosted payment infrastructure",
      logo: BtcpayLogo,
      cells: [
        c("You"),
        c("Invoices, not donors", true),
        c("No", true),
        c("Server, database, someone to run them", true),
        c("No", true),
      ],
    },
    {
      name: "The Giving Block",
      sub: "Custodial processor",
      logo: GivingBlockLogo,
      cells: [
        c("They do", true),
        c("Yes, in their system"),
        c("Automatic, sent as them"),
        c("A contract and their fee"),
        c("Yes, automatic"),
      ],
    },
    {
      name: "SatsRecord",
      sub: "You hold the keys. We do the paperwork.",
      logo: SatsRecordMark,
      us: true,
      cells: [
        c("You"),
        c("Yes, in yours. Fully exportable."),
        c("Automatic, sent as you"),
        c("A public key and a script tag"),
        c("No, by design"),
      ],
    },
  ],
};

export const pricing = {
  intro:
    "Free to run yourself, or a flat monthly fee for us to host it. A larger gift costs nothing more to record.",
  tiers: [
    {
      kind: "Self-hosted",
      amount: "Free",
      who: "Run it yourself.",
      body: "The same code, on your server. Bring your own node, or point it at mempool.space, which sees every address you check.",
      bullets: [
        "AGPL-3.0, forever",
        "Your node, your data, your uptime",
        "Community support",
      ],
    },
    {
      kind: "Hosted",
      badge: "Free during the pilot",
      amount: "Flat fee",
      who: "Waived for charities that can't afford it.",
      body: "We run the node, carry the data-protection burden and keep the lights on. Nothing to install or maintain, and guided setup for your wallet key and donor emails.",
      bullets: [
        "Widget, records, acknowledgements, exports",
        "Our node. No third-party lookups.",
        "Data processing agreement, email support",
      ],
    },
  ] as Array<{
    kind: string;
    badge?: string;
    amount: string;
    per?: string;
    who: string;
    body: string;
    bullets: string[];
  }>,
  never: "Never a percentage of donations.",
};

export const closing = {
  body: "Invite-only while we run a pilot with charities in the UK and US. Tell us about your organisation and we'll be in touch.",
  legal: "Open source, AGPL-3.0 · Not a money transmitter",
};

export const faq = {
  intro:
    "Questions we get from trustees, finance teams, fundraisers and the person who has to export the xpub.",
  groups: [
    {
      heading: "Custody and control",
      items: [
        {
          q: "Do you ever hold our bitcoin, and who can move it?",
          a: "No. You give us a public key, and we use it to derive addresses that belong to your wallet. We hold nothing that can sign, so we cannot move funds, and neither can anyone who breaches us. Only whoever holds your wallet's keys can do that. At launch we'll support single signature wallets, meaning the wallet would typically be managed by an individual within your organisation. Support for multi-signature wallets is on our roadmap.",
        },
        {
          q: "Are you a money transmitter? Do we need a licence to use you?",
          a: "We never take custody, convert or transmit, which keeps SatsRecord outside FinCEN money-services registration, MiCA and FCA crypto registration. Your own obligations as a charity accepting cryptoassets are unchanged and remain yours.",
        },
        {
          q: "What happens to us if SatsRecord shuts down?",
          a: "Nothing happens to the money: it was always in your wallet. The address manifest plus your seed recovers every address ever issued, your records are exportable as CSV at any time, and the code is open source under AGPL-3.0, so you or a contractor can keep running it.",
        },
      ],
    },
    {
      heading: "Records and tax",
      items: [
        {
          q: "How is each donation valued?",
          a: "When the transaction is mined (i.e. when it is confirmed on the public blockchain), it is valued in your reporting currency using Kraken's public market data. These valuation details are stored alongside every donation for easy auditing.",
        },
        {
          q: "What does the donor receive?",
          a: "Assuming they left an email address, they'll receive an acknowledgement email on confirmation: the amount in bitcoin, its fiat value, the date, and transaction reference. A US-specific tax letter is planned.",
        },
        {
          q: "Does this work with Gift Aid?",
          a: "No. The UK's HMRC does not treat cryptoassets as money, so Gift Aid cannot be claimed on a bitcoin donation. Donating bitcoin directly to a charity is a no-gain-no-loss disposal for UK capital gains tax, which is a real donor incentive, but that is true of any crypto donation, not something we add.",
        },
        {
          q: "Do you convert to fiat or do our bookkeeping?",
          a: "Neither, by design. You decide whether to hold or sell, and do so through your own exchange. We are exploring potential partnerships with a number of exchanges, with a view to streamlining the process of selling donated bitcoin.",
        },
      ],
    },
    {
      heading: "Donors and data",
      items: [
        {
          q: "What does the donor see?",
          a: 'A small widget on your donate page. They click "Give", optionally add a name and email, and get a fresh address as a QR code and by email, so they can pay later from a hardware wallet. On payment confirmation they get the acknowledgement email. Giving anonymously is fine too: the gift is still recorded and valued. They never leave your site or land on someone else\'s.',
        },
        {
          q: "Where does this sit under data protection laws?",
          a: "You are the data controller and we are your processor, with a data processing agreement on the hosted plan. Donor details are encrypted at rest, exportable, and deleted on request without breaking the financial record. We never sell or reuse them.",
        },
        {
          q: "Do emails come from us or from you?",
          a: 'Currently from the SatsRecord domain as "[Your Charity] via SatsRecord", with replies going to you. Sending from your own domain, once you add DNS records, is planned.',
        },
      ],
    },
    {
      heading: "Wallets and bitcoin",
      items: [
        {
          q: "Which wallets and key formats work?",
          a: "Any wallet that exports an account-level extended public key: XPUB, YPUB, or ZPUB, plus output descriptors including taproot. There are guides for Sparrow, Ledger, Trezor and BlueWallet to help you find your key.",
          links: walletGuides,
        },
        {
          q: "Will my wallet see every donation?",
          a: "Yes, provided its gap limit is high enough. Each donor is issued a fresh address whether or not they pay, so unfunded addresses accumulate. The dashboard and the manifest export tell you the minimum gap limit to set, and most wallets let you raise it.",
        },
        {
          q: "How do you detect payments, and who sees our addresses?",
          a: "On the hosted plan, our own Bitcoin node. Addresses are never sent to a third-party API. If you self-host you can point at your own node, or at mempool.space with the understanding that it then sees every address you check.",
        },
        {
          q: "Do you support Lightning?",
          a: "Not yet - we're on-chain only for now. But Lightning support is planned after our pilot.",
        },
        {
          q: "Why not just run BTCPay Server?",
          a: "If you have someone to run a server and a database, and you only need invoices, BTCPay Server is excellent. SatsRecord is for the charity that also needs donor records, acknowledgements, valuation at receipt and exports, and would rather paste a public key than host anything.",
        },
      ],
    },
    {
      heading: "Pricing and availability",
      items: [
        {
          q: "What will it cost after the pilot?",
          a: "We haven't fixed the number yet. It will be a flat monthly fee and never a percentage of donations. We'll publish it before the pilot ends, pilot charities will hear first, and we'll permanently waive it for charities that can't afford it.",
        },
        {
          q: "Can we use it today?",
          a: "Hosted access is invite-only while we run a pilot with charities in the UK and US. Request access and tell us about your organisation. The source is public now if you want to read it or run it yourself.",
        },
      ],
    },
  ] as Array<{
    heading: string;
    items: Array<{ q: string; a: string; links?: typeof walletGuides }>;
  }>,
};
