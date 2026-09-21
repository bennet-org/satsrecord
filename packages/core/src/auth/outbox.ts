import { createHash, timingSafeEqual } from "node:crypto";

/** Separate from app login: the outbox itself contains the links used to sign in. */
export function authoriseOutbox(
  authorization: string | null,
  password?: string,
) {
  if (!password || password.length < 32 || !authorization?.startsWith("Basic "))
    return false;
  const supplied = Buffer.from(authorization.slice(6), "base64").toString(
    "utf8",
  );
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`outbox:${password}`));
}
