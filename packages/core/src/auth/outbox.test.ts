import { expect, it } from "vitest";
import { authoriseOutbox } from "./outbox";

it("requires a configured outbox password and matching Basic credentials", () => {
  const password = "a-separate-development-password-12345";
  const basic = (value: string) =>
    `Basic ${Buffer.from(value).toString("base64")}`;
  expect(authoriseOutbox(basic(`outbox:${password}`), password)).toBe(true);
  for (const value of [
    null,
    "Basic !!!",
    basic("outbox:wrong"),
    basic(`user:${password}`),
  ])
    expect(authoriseOutbox(value, password)).toBe(false);
  expect(authoriseOutbox(basic("outbox:"), "")).toBe(false);
  expect(authoriseOutbox(basic("outbox:short"), "short")).toBe(false);
  expect(authoriseOutbox(basic(`outbox:${password}`))).toBe(false);
});
