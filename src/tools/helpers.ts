import type { CallToolResult } from "@modelcontextprotocol/server";
import type { AdStatItem } from "../api/types.js";
import type { AuditLogger } from "../audit.js";
import { summarizeParams } from "../audit.js";
import type { TelegramAdsClient } from "../api/client.js";
import type { Config } from "../config.js";
import type { Policy } from "../policy.js";
import { hintFor, PolicyError, TelegramAdsError } from "../errors.js";
import { ratio } from "../money.js";

export interface ToolContext {
  client: TelegramAdsClient;
  config: Config;
  policy: Policy;
  audit: AuditLogger;
}

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function fail(error: unknown): CallToolResult {
  const code =
    error instanceof TelegramAdsError || error instanceof PolicyError ? error.code : "ERROR";
  const message = error instanceof Error ? error.message : String(error);
  const hint = hintFor(error);
  const text = `Error [${code}]: ${message}${hint ? `\n\nHint: ${hint}` : ""}`;
  return { isError: true, content: [{ type: "text", text }] };
}

/**
 * Wraps a tool body with error normalisation and audit logging.
 * Tool implementations stay focused on their actual job.
 */
export function toolHandler<Input>(
  ctx: ToolContext,
  tool: string,
  fn: (input: Input) => Promise<unknown>,
): (input: Input) => Promise<CallToolResult> {
  return async (input: Input): Promise<CallToolResult> => {
    const started = Date.now();
    const record = (input ?? {}) as Record<string, unknown>;
    const accountId = typeof record.account_id === "string" ? record.account_id : undefined;
    const method = typeof record.method === "string" ? record.method : undefined;

    try {
      const data = await fn(input);
      const idempotencyKey =
        data && typeof data === "object" && "idempotency_key" in data
          ? (data as { idempotency_key?: unknown }).idempotency_key
          : undefined;
      ctx.audit.record({
        tool,
        outcome: "ok",
        duration_ms: Date.now() - started,
        ...(accountId ? { account_id: accountId } : {}),
        ...(method ? { method } : {}),
        ...(typeof idempotencyKey === "string" ? { idempotency_key: idempotencyKey } : {}),
        params: summarizeParams(input),
      });
      return ok(data);
    } catch (error) {
      const code =
        error instanceof TelegramAdsError || error instanceof PolicyError ? error.code : "ERROR";
      ctx.audit.record({
        tool,
        outcome: "error",
        duration_ms: Date.now() - started,
        ...(accountId ? { account_id: accountId } : {}),
        ...(method ? { method } : {}),
        error: code,
        params: summarizeParams(input),
      });
      return fail(error);
    }
  };
}

/** Drops undefined/null so optional fields are not sent to the API. */
export function compact(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

export function toUnixSeconds(value: string | number, field: string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
    const seconds = value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
    return seconds;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return toUnixSeconds(Number(trimmed), field);

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be Unix seconds, milliseconds, or an ISO 8601 date.`);
  }
  return Math.floor(parsed / 1000);
}

export interface TimeRange {
  from: number;
  to: number;
}

export function parseRange(from: string | number, to: string | number): TimeRange {
  const start = toUnixSeconds(from, "from");
  const end = toUnixSeconds(to, "to");
  if (start >= end) throw new Error("from must be earlier than to.");
  return { from: start, to: end };
}

/**
 * Telegram accepts at most 1000 intervals per stats request.
 * Split larger ranges into contiguous windows so callers can ask for a year.
 */
export function planWindows(range: TimeRange, interval: number): TimeRange[] {
  const maxIntervals = 1000;
  const span = interval * maxIntervals;
  if (range.to - range.from <= span) return [range];

  const windows: TimeRange[] = [];
  for (let start = range.from; start < range.to; start += span) {
    windows.push({ from: start, to: Math.min(start + span, range.to) });
  }
  return windows;
}

export interface StatsSummary {
  views: number;
  opens: number;
  clicks: number;
  actions: number;
  spent_budget: number;
  ctr: number;
  cpm: number;
  cpc: number;
}

export function summarizeStats(items: AdStatItem[]): StatsSummary {
  let views = 0;
  let opens = 0;
  let clicks = 0;
  let actions = 0;
  let spent = 0;

  for (const item of items) {
    views += item.views ?? 0;
    opens += item.opens ?? 0;
    clicks += item.clicks ?? 0;
    actions += item.actions ?? 0;
    spent += item.spent_budget ?? 0;
  }

  return {
    views,
    opens,
    clicks,
    actions,
    spent_budget: Number(spent.toFixed(6)),
    ctr: ratio(clicks, views),
    cpm: ratio(spent, views, 1000),
    cpc: ratio(spent, clicks),
  };
}
