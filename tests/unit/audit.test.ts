import { describe, expect, it } from "vitest";
import { summarizeParams } from "../../src/audit.js";

describe("audit redaction", () => {
  it("keeps phone numbers and hashes out of the log", () => {
    const summary = summarizeParams({
      title: "Customers",
      add_phones: ["+491234567", "a".repeat(64)],
      remove_phones: ["+499999999"],
      email: "billing@example.com",
    }) as Record<string, unknown>;

    expect(summary.title).toBe("Customers");
    expect(summary.add_phones).toEqual({ count: 2 });
    expect(summary.remove_phones).toEqual({ count: 1 });
    expect(summary.email).toEqual({ count: 1 });
  });

  it("stores only the length of ad text and code", () => {
    const summary = summarizeParams({ text: "A long ad copy", code: "return 1;" }) as Record<
      string,
      unknown
    >;
    expect(summary.text).toEqual({ length: 14 });
    expect(summary.code).toEqual({ length: 9 });
  });
});
