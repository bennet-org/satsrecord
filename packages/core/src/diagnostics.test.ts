import { afterEach, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { invitationErrorMessage } from "./auth/invitation-errors";
import { handleWidgetRequest } from "./widget-http";
import type { WidgetServices } from "./widget";

afterEach(() => vi.restoreAllMocks());

it("catches service initialization failures, correlates sanitized logs and a generic 503", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await handleWidgetRequest(
    new Request("https://example.org/api/widget/org"),
    "org",
    "192.0.2.1",
    () => {
      throw new Error("secret-key and donor@example.org");
    },
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = (await response.json()) as { error: string; requestId: string };
  expect(body.error).toContain("temporarily unavailable");
  expect(JSON.stringify(body)).not.toContain("secret-key");
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.parse(log.mock.calls[0]![0])).toEqual({
    event: "widget_failure",
    stage: "initialization",
    category: "unexpected",
    requestId: body.requestId,
  });
});

it("logs database failure categories without SQL, parameters, error messages or stacks", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const db = {
    select() {
      throw new Error("query with donor@example.org", {
        cause: Object.assign(new Error("credentials"), {
          code: "ECONNREFUSED",
        }),
      });
    },
  };
  const response = await handleWidgetRequest(
    new Request("https://example.org/api/widget/org"),
    "11111111-1111-1111-1111-111111111111",
    "192.0.2.1",
    { db } as unknown as WidgetServices,
  );
  expect(response.status).toBe(503);
  const record = JSON.parse(log.mock.calls[0]![0]);
  expect(record).toMatchObject({
    event: "widget_failure",
    stage: "configuration",
    category: "database_unavailable",
  });
  expect(Object.keys(record).sort()).toEqual([
    "category",
    "event",
    "requestId",
    "stage",
  ]);
});

it("preserves intended invitation errors and hides unexpected/server errors", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(
    invitationErrorMessage(
      new APIError("BAD_REQUEST", { message: "Invitation expired." }),
    ),
  ).toBe("Invitation expired.");
  expect(log).not.toHaveBeenCalled();
  for (const error of [
    new Error("SQL donor@example.org"),
    new APIError("INTERNAL_SERVER_ERROR", { message: "SQL donor@example.org" }),
    "SQL donor@example.org",
  ])
    expect(invitationErrorMessage(error)).toBe(
      "Could not accept the invitation. Please try again later.",
    );
  expect(JSON.stringify(log.mock.calls)).not.toContain("donor@example.org");
});
