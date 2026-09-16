export const site = {
  name: "SatsRecord",
  descriptor: "Non-custodial bitcoin donations for charities and non-profits.",
  spine: "You hold the keys. We do the paperwork.",
  sourceUrl: "https://github.com/satsrecord",
  domain: "satsrecord.org",
};

export const nav = [
  { label: "How it works", href: "#how" },
  { label: "Compared", href: "#compared" },
  { label: "Pricing", href: "#pricing" },
  { label: "Source", href: site.sourceUrl },
];

export const hero = {
  headline: "Accept bitcoin without the middleman.",
  lead: "No processors taking a cut. Donors pay a wallet you control, and every gift is automatically recorded, valued and acknowledged.",
  facts: [
    {
      title: "We can't touch funds.",
      body: "Watch-only. We derive addresses from a public key and can never move funds.",
    },
    {
      title: "Donor data stays yours.",
      body: "Encrypted at rest, exportable, deletable on request. Never sold, never shared.",
    },
    {
      title: "Your setup outlives us.",
      body: "Every issued address is exportable. If we vanish, your wallet works and your history is intact.",
    },
    {
      title: "Open source.",
      body: "AGPL-3.0. Self-host it, audit it, or let us run it for you.",
    },
  ],
};

/** The one fictional record used everywhere a sample appears. */
export const sampleRecord = {
  id: "Gift 0041",
  status: "Confirmed",
  rows: [
    ["Donor", "A. Donor · verified"],
    ["Block time", "14 Sep 2026, 10:42 UTC"],
    ["Amount", "0.0125 BTC"],
    ["Value at block", "$815.20", "big"],
    ["Basis", "Kraken XBT/USD"],
    ["Acknowledgement", "Sent · template v3"],
  ] as Array<[string, string, string?]>,
};

export const whoFor = {
  heading: "Bitcoin donations for charities and non-profits.",
  body: "Built for organisations that receive bitcoin at an address they control. Whether you hold it as a treasury asset or sell it, the gift goes directly from donor to your wallet.",
  roles: [
    [
      "Finance",
      "A record per gift with value at block time, the basis, and the acknowledgement that was sent. CSV out.",
    ],
    [
      "Fundraising",
      "A widget on your site. Donors get a fresh address and a letter, and stay on your list, not someone else's.",
    ],
    [
      "Trustees",
      "No custody, no conversion, no money transmission. Open source, so the claims can be checked.",
    ],
  ],
};

export const steps = [
  [
    "Paste a public key",
    "From a fresh account in your wallet. We check it is unused, show you the first address to confirm, and never ask for anything that can sign.",
  ],
  [
    "Add one script tag",
    "The widget sits on your donate page. A donor clicks give, adds a name and email if they want, and gets a fresh address on screen and by email.",
  ],
  [
    "Watch it arrive",
    "Detection from our node or yours. Value pinned at block time in your currency. Letter sent on first confirmation. Record filed, append-only.",
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
  intro:
    "Three ways a charity takes bitcoin today, and what each one leaves you doing yourself.",
  columns: [
    "Who holds the coins",
    "Donor record",
    "Tax acknowledgement",
    "Setup and upkeep",
    "Fiat conversion",
  ],
  options: [
    {
      name: "A static address",
      sub: "The status quo",
      logo: "dots",
      cells: [
        c("You"),
        c("None. A list of transactions.", true),
        c("You write each by hand", true),
        c("None"),
        c("No", true),
      ],
    },
    {
      name: "BTCPay Server",
      sub: "Self-hosted payment infrastructure",
      logo: "/logos/btcpay.svg",
      cells: [
        c("You"),
        c("Invoices, not donors", true),
        c("No", true),
        c("A server, a database, and someone to run them", true),
        c("No", true),
      ],
    },
    {
      name: "The Giving Block",
      sub: "Custodial processor",
      logo: "/logos/the-giving-block.svg",
      cells: [
        c("They do, until they pay out", true),
        c("Yes, in their system"),
        c("Automatic, sent as them"),
        c("A contract and their fee"),
        c("Yes, automatic"),
      ],
    },
    {
      name: "SatsRecord",
      sub: "You hold the keys. We do the paperwork.",
      logo: "square",
      us: true,
      cells: [
        c("You"),
        c("Yes, in yours. Append-only, exportable."),
        c("Automatic, sent as you"),
        c("A public key and a script tag"),
        c("No, by design"),
      ],
    },
  ],
};

export const pricing = {
  intro:
    "A fixed fee by the size of your organisation, never a percentage of what you raise. A larger gift costs nothing more to record.",
  tiers: [
    {
      kind: "Self-hosted",
      amount: "Free",
      who: "Run it yourself.",
      body: "The same code, on your server. Bring your own node, or point it at mempool.space with the privacy warning that deserves.",
      bullets: [
        "AGPL-3.0, forever",
        "Your node, your data, your uptime",
        "Community support",
      ],
    },
    {
      kind: "Hosted",
      amount: "$149",
      per: "/ month",
      who: "Waived for smaller charities, and free for everyone during the pilot.",
      body: "We run the node, carry the data-protection burden and keep the lights on. Nothing to install, nothing to maintain.",
      bullets: [
        "Widget, records, letters, exports",
        "Our node. No third-party lookups.",
        "Data processing agreement, email support",
      ],
    },
  ],
  never: "Never a percentage of donations.",
};

export const closing = {
  body: "Invite-only while we work with our first design partners in the UK and US. Tell us about your organisation and we will be in touch.",
  legal: "Open source, AGPL-3.0 · Not a money transmitter",
};
