// Domain interfaces from docs/design.md. Fakes in ./fakes; real implementations in Phase 7.

/** A settlement is on-chain (txid:vout) now; Lightning (payment hash) is additive. */
export type SettlementRef =
  | { kind: "onchain"; txid: string; vout: number }
  | { kind: "lightning"; paymentHash: string };

export interface Deriver {
  /** Address at `index` on the external chain of the stored descriptor. Never reuses. */
  derive(descriptor: string, index: number): Promise<string>;
}

export interface ChainSource {
  /** History for an address: mempool and confirmed outputs paying it. */
  history(address: string): Promise<
    Array<{
      ref: SettlementRef;
      sats: number;
      firstSeenAt: Date;
      blockTime?: Date;
      confirmations: number;
    }>
  >;
}

export interface RateSource {
  /** Rate of one BTC in `currency` at `at`, with provenance for the valuation row. */
  rateAt(
    currency: string,
    at: Date,
  ): Promise<{
    rate: number;
    source: string;
    pair: string;
    method: string;
    timestamp: Date;
  }>;
}
