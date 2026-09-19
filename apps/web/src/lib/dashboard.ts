export const date = (d: Date | null) =>
  d
    ? d.toLocaleString("en-GB", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " UTC"
    : "Pending";
export const bitcoin = (n: number, unit?: string) =>
  unit === "BTC"
    ? (n / 100_000_000).toLocaleString("en-GB", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8,
      }) + " BTC"
    : n.toLocaleString("en-GB") + " sats";
export const money = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: currency === "USD" ? "narrowSymbol" : "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(amount));
export const attribution = (s?: string) =>
  s === "email_confirmed"
    ? "Email verified"
    : s === "claimed"
      ? "Email not verified"
      : "—";

export const emailStatus = (s?: string) =>
  s === "email_confirmed" ? "Verified" : s === "claimed" ? "Not verified" : "—";

export const paymentStatus = (status: "mempool" | "confirmed" | "reorged") =>
  ({
    mempool: "Pending",
    confirmed: "Confirmed",
    reorged: "Pending",
  })[status];
