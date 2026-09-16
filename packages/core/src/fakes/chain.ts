import type { ChainSource, SettlementRef } from "../domain";

type Entry = Awaited<ReturnType<ChainSource["history"]>>[number];

/** In-memory chain for tests and the demo's simulate-donation action. */
export class FakeChainSource implements ChainSource {
  private readonly entries = new Map<string, Entry[]>();
  private height = 912_344;

  /** Register a payment to `address`. Unconfirmed until `confirm()`. */
  fund(
    address: string,
    sats: number,
    opts: { txid?: string; vout?: number; at?: Date } = {},
  ) {
    const ref: SettlementRef = {
      kind: "onchain",
      txid: opts.txid ?? randomTxid(),
      vout: opts.vout ?? 0,
    };
    const e: Entry = {
      ref,
      sats,
      firstSeenAt: opts.at ?? new Date(),
      confirmations: 0,
    };
    this.entries.set(address, [...(this.entries.get(address) ?? []), e]);
    return ref;
  }

  /** Mine a block: every unconfirmed entry gets a block time and one confirmation; confirmed ones gain one. */
  mine(blockTime = new Date()) {
    this.height += 1;
    for (const list of this.entries.values()) {
      for (const e of list) {
        if (e.confirmations === 0) e.blockTime = blockTime;
        e.confirmations += 1;
      }
    }
    return this.height;
  }

  async history(address: string) {
    return (this.entries.get(address) ?? []).map((e) => ({ ...e }));
  }
}

function randomTxid() {
  let s = "";
  for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
