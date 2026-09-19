export const date = (d: Date | null) =>
  d
    ? d.toLocaleString("en-GB", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " UTC"
    : "Pending";
export const sats = (n: number) => n.toLocaleString("en-GB") + " sats";
export const attribution = (s?: string) =>
  s === "email_confirmed"
    ? "Email confirmed"
    : s === "claimed"
      ? "Claimed"
      : "Unattributed";
