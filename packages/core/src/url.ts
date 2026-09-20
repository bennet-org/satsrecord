/**
 * Post-login destinations. Only same-origin paths are allowed, and the string has to survive the
 * browser's own parsing: `\` is normalised to `/`, so `/\evil.com` resolves to `//evil.com` and
 * leaves the site. Percent-encoded separators and control characters go the same way.
 */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f]|%2[fF]|%5[cC]/;
const PARSER_ORIGIN = "https://satsrecord.invalid";

export function safeNext(next: string | null | undefined, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || UNSAFE.test(next)) return fallback;
  try {
    return new URL(next, PARSER_ORIGIN).origin === PARSER_ORIGIN
      ? next
      : fallback;
  } catch {
    return fallback;
  }
}
