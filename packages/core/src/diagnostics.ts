import { randomUUID } from "node:crypto";

/** Log only fixed categories and a correlation ID: Error messages/stacks can contain SQL and PII. */
export function reportFailure(
  event: "widget" | "invitation",
  stage: string,
  error: unknown,
) {
  let category = "unexpected";
  let cause = error;
  for (
    let depth = 0;
    depth < 4 && cause && typeof cause === "object";
    depth++
  ) {
    const code = "code" in cause ? cause.code : undefined;
    if (
      [
        "ECONNREFUSED",
        "ECONNRESET",
        "ETIMEDOUT",
        "ENOTFOUND",
        "57P01",
        "53300",
      ].includes(String(code))
    ) {
      category = "database_unavailable";
      break;
    }
    if (
      [
        "23505",
        "23503",
        "23502",
        "22P02",
        "42P01",
        "42703",
        "40001",
        "40P01",
      ].includes(String(code))
    ) {
      category = "database_query";
      break;
    }
    cause = "cause" in cause ? cause.cause : undefined;
  }
  const requestId = randomUUID();
  console.error(
    JSON.stringify({ event: `${event}_failure`, stage, category, requestId }),
  );
  return requestId;
}
