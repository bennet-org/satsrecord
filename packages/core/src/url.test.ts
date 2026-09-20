import { describe, expect, it } from "vitest";
import { safeNext } from "./url";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    for (const path of ["/app", "/app/donations", "/app?saved=1", "/app#top"])
      expect(safeNext(path)).toBe(path);
  });

  it("falls back for anything that can leave the origin", () => {
    for (const next of [
      "//evil.com",
      "/\\evil.com",
      "/\\\\evil.com",
      "https://evil.com",
      "//evil.com/app",
      "/%2fevil.com",
      "/%5cevil.com",
      "/app\nSet-Cookie: x=1",
      "app/donations",
      "",
      null,
      undefined,
    ])
      expect(safeNext(next)).toBe("/app");
  });

  it("takes the caller's fallback", () => {
    expect(safeNext("https://evil.com", "/login")).toBe("/login");
  });
});
