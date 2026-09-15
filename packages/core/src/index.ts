// Domain interfaces from docs/design.md. Implementations arrive with ROADMAP Phase 0 (fakes) and Phase 7 (real).

/** A settlement is on-chain (txid:vout) now; Lightning (payment hash) is additive. */
export type SettlementRef =
  | { kind: 'onchain'; txid: string; vout: number }
  | { kind: 'lightning'; paymentHash: string };

export interface Deriver {
  /** Address at `index` on the external chain of the stored descriptor. Never reuses. */
  derive(descriptor: string, index: number): Promise<string>;
}

export interface ChainSource {
  /** History for an address: mempool and confirmed outputs paying it. */
  history(address: string): Promise<Array<{ ref: SettlementRef; sats: number; firstSeenAt: Date; blockTime?: Date; confirmations: number }>>;
}

export interface RateSource {
  /** Rate of one BTC in `currency` at `at`, with provenance for the valuation row. */
  rateAt(currency: string, at: Date): Promise<{ rate: number; source: string; pair: string; method: string; timestamp: Date }>;
}

export interface Mailer {
  send(msg: { to: string; from: { name: string; address: string }; replyTo?: string; subject: string; html: string; text: string; templateVersion: string }): Promise<{ providerMessageId: string }>;
}
