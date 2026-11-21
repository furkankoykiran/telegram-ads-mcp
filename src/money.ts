import type { Currency } from "./api/types.js";

/**
 * Currency precision rules from the Telegram Ads documentation.
 * CPM and budget values use `budget` decimals; account amounts use `amount`.
 */
const PRECISION: Record<Currency, { budget: number; amount: number }> = {
  EUR: { budget: 2, amount: 5 },
  TON: { budget: 2, amount: 5 },
  XTR: { budget: 0, amount: 3 },
};

export type MoneyKind = "budget" | "amount";

export function precisionFor(currency: Currency, kind: MoneyKind): number {
  return PRECISION[currency][kind];
}

export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const text = value.toString();
  if (!text.includes("e")) {
    const dot = text.indexOf(".");
    return dot === -1 ? 0 : text.length - dot - 1;
  }
  // Normalise exponential notation (e.g. 1e-7) before counting decimals.
  const normalised = value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  const dot = normalised.indexOf(".");
  return dot === -1 ? 0 : normalised.length - dot - 1;
}

export function assertMoney(
  value: number,
  currency: Currency,
  kind: MoneyKind,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  const allowed = precisionFor(currency, kind);
  const actual = decimalPlaces(value);
  if (actual > allowed) {
    throw new Error(
      `${field} has ${actual} decimal places, but ${currency} allows ${allowed} for ${kind} values. ` +
        `Round the value before sending it.`,
    );
  }
}

export function roundMoney(value: number, currency: Currency, kind: MoneyKind): number {
  return Number(value.toFixed(precisionFor(currency, kind)));
}

/** Ratios used in summaries, rounded to keep tool output compact. */
export function ratio(numerator: number, denominator: number, scale = 1): number {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * scale).toFixed(6));
}
