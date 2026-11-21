import { describe, expect, it } from "vitest";
import { runCode } from "../../src/code-mode/run.js";

const base = {
  call: async () => ({ ok: true }),
  allowWrite: false,
  isWrite: () => false,
};

describe("Code Mode sandbox", () => {
  it("runs a plain statement body", async () => {
    const result = await runCode({ ...base, code: "const a = 2; return a * 21;" });
    expect(result.ok).toBe(true);
    expect(result.result).toBe(42);
  });

  it("accepts an async arrow function", async () => {
    const result = await runCode({ ...base, code: "async () => ({ answer: 42 })" });
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ answer: 42 });
  });

  it("captures console output", async () => {
    const result = await runCode({ ...base, code: 'console.log("hello", { a: 1 }); return 1;' });
    expect(result.logs).toEqual(['hello {"a":1}']);
  });

  it("exposes tg methods and passes parameters", async () => {
    const seen: Array<{ method: string; params: unknown }> = [];
    const result = await runCode({
      ...base,
      call: async (method, params) => {
        seen.push({ method, params });
        return { total_count: 2, ads: [{ ad_id: 1 }, { ad_id: 2 }] };
      },
      code: `
        const page = await tg.getAdsList({ limit: 2 });
        return page.ads.map((ad) => ad.ad_id);
      `,
    });

    expect(result.ok).toBe(true);
    expect(result.result).toEqual([1, 2]);
    expect(seen).toEqual([{ method: "getAdsList", params: { limit: 2 } }]);
    expect(result.calls).toHaveLength(1);
  });

  it("runs several sequential API calls without corrupting the runtime", async () => {
    let calls = 0;
    const result = await runCode({
      ...base,
      call: async () => {
        calls += 1;
        return { index: calls };
      },
      code: `
        const seen = [];
        for (let i = 0; i < 5; i += 1) {
          const page = await tg.getCurrentAccount();
          seen.push(page.index);
        }
        return seen;
      `,
    });

    expect(result.ok).toBe(true);
    expect(result.result).toEqual([1, 2, 3, 4, 5]);
    expect(result.calls).toHaveLength(5);
  });

  it("does not expose host capabilities", async () => {
    const result = await runCode({
      ...base,
      code: `
        return {
          process: typeof process,
          fetch: typeof fetch,
          require: typeof require,
          escape: globalThis.constructor.constructor("return typeof process")(),
        };
      `,
    });

    expect(result.result).toEqual({
      process: "undefined",
      fetch: "undefined",
      require: "undefined",
      escape: "undefined",
    });
  });

  it("blocks writes when read-only", async () => {
    const result = await runCode({
      ...base,
      isWrite: (method) => method === "createAd",
      code: "await tg.createAd({ title: 'x' });",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/read-only/);
  });

  it("enforces the call limit", async () => {
    const result = await runCode({
      ...base,
      maxCalls: 2,
      code: "for (let i = 0; i < 3; i += 1) { await tg.getCurrentAccount(); }",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Call limit/);
  });

  it("rejects oversized output", async () => {
    const result = await runCode({ ...base, maxOutputBytes: 100, code: 'return "x".repeat(200);' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/byte limit/);
  });

  it("interrupts infinite loops", async () => {
    const result = await runCode({ ...base, timeoutMs: 100, code: "while (true) {}" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeded|interrupted/);
  });
});
