import type { RateSource } from "../domain";

/** One rate for every query. The valuation row still records source and method, so the demo output is shaped like production. */
export class FixedRateSource implements RateSource {
  constructor(
    private readonly rates: Record<string, number> = {
      USD: 65_216,
      GBP: 48_992,
      EUR: 56_310,
    },
  ) {}
  async rateAt(currency: string, at: Date) {
    const rate = this.rates[currency.toUpperCase()];
    if (rate === undefined) throw new Error(`no fixed rate for ${currency}`);
    return {
      rate,
      source: "fixed",
      pair: `XBT/${currency.toUpperCase()}`,
      method: "fixed-demo-rate",
      timestamp: at,
    };
  }
}
