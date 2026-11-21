import { describe, expect, it } from "vitest";
import { assertMoney, decimalPlaces, precisionFor, roundMoney } from "../../src/money.js";

describe("currency precision", () => {
  it("uses the documented decimals per currency", () => {
    expect(precisionFor("EUR", "budget")).toBe(2);
    expect(precisionFor("TON", "budget")).toBe(2);
    expect(precisionFor("XTR", "budget")).toBe(0);
    expect(precisionFor("EUR", "amount")).toBe(5);
    expect(precisionFor("XTR", "amount")).toBe(3);
  });

  it("counts decimals without floating point surprises", () => {
    expect(decimalPlaces(1)).toBe(0);
    expect(decimalPlaces(1.25)).toBe(2);
    expect(decimalPlaces(1.234567)).toBe(6);
    expect(decimalPlaces(1e-7)).toBe(7);
  });

  it("accepts values within precision", () => {
    expect(() => assertMoney(1.25, "EUR", "budget", "cpm")).not.toThrow();
    expect(() => assertMoney(0.12345, "EUR", "amount", "amount")).not.toThrow();
    expect(() => assertMoney(12, "XTR", "budget", "cpm")).not.toThrow();
  });

  it("rejects values with too many decimals", () => {
    expect(() => assertMoney(1.234, "EUR", "budget", "cpm")).toThrow(/allows 2/);
    expect(() => assertMoney(1.5, "XTR", "budget", "cpm")).toThrow(/allows 0/);
    expect(() => assertMoney(0.1234, "XTR", "amount", "amount")).toThrow(/allows 3/);
  });

  it("rejects negative and non-finite values", () => {
    expect(() => assertMoney(-1, "EUR", "budget", "cpm")).toThrow(/non-negative/);
    expect(() => assertMoney(Number.NaN, "EUR", "budget", "cpm")).toThrow(/non-negative/);
  });

  it("rounds to the currency precision", () => {
    expect(roundMoney(1.239, "EUR", "budget")).toBe(1.24);
    expect(roundMoney(1.6, "XTR", "budget")).toBe(2);
  });
});
