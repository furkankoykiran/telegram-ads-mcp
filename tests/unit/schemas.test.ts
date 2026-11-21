import { describe, expect, it } from "vitest";
import { assertTargetLimits, targetSchema } from "../../src/tools/schemas.js";

describe("target schema", () => {
  it("parses channel targeting", () => {
    const target = targetSchema.parse({
      type: "channels",
      language_codes: ["en"],
      topic_ids: [1, 2],
    });
    expect(target.type).toBe("channels");
  });

  it("rejects channel_ids combined with topics", () => {
    const target = targetSchema.parse({
      type: "channels",
      channel_ids: ["@example"],
      topic_ids: [1],
    });
    expect(() => assertTargetLimits(target)).toThrow(/cannot be combined/);
  });

  it("counts included and excluded audiences together", () => {
    const target = targetSchema.parse({
      type: "users",
      country_codes: ["DE"],
      audience_ids: [1, 2, 3, 4, 5, 6],
      exclude_audience_ids: [7, 8, 9, 10, 11],
    });
    expect(() => assertTargetLimits(target)).toThrow(/at most 10/);
  });

  it("requires exactly one country when locations are used", () => {
    const target = targetSchema.parse({
      type: "users",
      country_codes: ["DE", "FR"],
      location_ids: [10],
    });
    expect(() => assertTargetLimits(target)).toThrow(/exactly one country/);
  });

  it("rejects empty search targeting", () => {
    expect(() => targetSchema.parse({ type: "search", search_queries: [] })).toThrow();
  });
});
