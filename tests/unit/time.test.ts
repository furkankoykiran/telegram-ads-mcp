import { describe, expect, it } from "vitest";
import { parseRange, planWindows, summarizeStats, toUnixSeconds } from "../../src/tools/helpers.js";

describe("time parsing", () => {
  it("accepts unix seconds, milliseconds and ISO dates", () => {
    expect(toUnixSeconds(1_700_000_000, "from")).toBe(1_700_000_000);
    expect(toUnixSeconds(1_700_000_000_000, "from")).toBe(1_700_000_000);
    expect(toUnixSeconds("1700000000", "from")).toBe(1_700_000_000);
    expect(toUnixSeconds("2023-11-14T22:13:20Z", "from")).toBe(1_700_000_000);
  });

  it("rejects invalid input and inverted ranges", () => {
    expect(() => toUnixSeconds("not-a-date", "from")).toThrow(/Unix seconds/);
    expect(() => parseRange(100, 100)).toThrow(/earlier/);
  });
});

describe("stats windows", () => {
  it("keeps ranges under 1000 intervals intact", () => {
    expect(planWindows({ from: 0, to: 86_400 }, 86_400)).toEqual([{ from: 0, to: 86_400 }]);
  });

  it("splits larger ranges into contiguous windows", () => {
    const windows = planWindows({ from: 0, to: 86_400 * 2500 }, 86_400);
    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual({ from: 0, to: 86_400 * 1000 });
    expect(windows[2]?.to).toBe(86_400 * 2500);
  });
});

describe("stats summary", () => {
  it("sums counters and derives ratios", () => {
    const summary = summarizeStats([
      {
        from_time: 0,
        to_time: 86_400,
        views: 1000,
        opens: 100,
        clicks: 50,
        actions: 5,
        currency: "EUR",
        spent_budget: 2,
      },
      {
        from_time: 86_400,
        to_time: 172_800,
        views: 1000,
        opens: 100,
        clicks: 50,
        actions: 5,
        currency: "EUR",
        spent_budget: 2,
      },
    ]);

    expect(summary.views).toBe(2000);
    expect(summary.spent_budget).toBe(4);
    expect(summary.ctr).toBe(0.05);
    expect(summary.cpm).toBe(2);
    expect(summary.cpc).toBe(0.04);
  });

  it("returns zero ratios when there are no views", () => {
    const summary = summarizeStats([]);
    expect(summary.ctr).toBe(0);
    expect(summary.cpm).toBe(0);
  });
});
