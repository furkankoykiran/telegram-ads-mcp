import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AccountReportItem, AdStatItem } from "../api/types.js";
import {
  compact,
  parseRange,
  planWindows,
  summarizeStats,
  toolHandler,
  type ToolContext,
} from "./helpers.js";

const time = z.union([z.string().min(1), z.number().int().positive()]);

export function registerStatsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_get_stats",
    {
      title: "Get advertising stats",
      description:
        "Get account or per-ad statistics for a time range. from/to accept Unix seconds, milliseconds, or " +
        "ISO 8601. interval is 86400 (daily, default) or 300 (5 minutes). Ranges above 1000 intervals are " +
        "split automatically. Always returns totals and derived CTR/CPM/CPC; set include_series for the " +
        "raw time series. Timestamps are inclusive for from and exclusive for to.",
      inputSchema: z.object({
        scope: z.enum(["account", "ad"]),
        ad_ids: z.array(z.number().int().positive()).max(100).optional(),
        account_id: z.string().optional(),
        from: time,
        to: time,
        interval: z.union([z.literal(300), z.literal(86400)]).optional(),
        include_series: z
          .boolean()
          .optional()
          .describe("Include raw per-interval rows (default false)."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_stats", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const interval = input.interval ?? 86400;
      const range = parseRange(input.from, input.to);
      const windows = planWindows(range, interval);

      if (input.scope === "account") {
        const items: AdStatItem[] = [];
        for (const window of windows) {
          const chunk = await ctx.client.call<AdStatItem[]>(
            "getAccountStats",
            compact({
              account_id: input.account_id,
              from_time: window.from,
              to_time: window.to,
              interval,
            }),
          );
          items.push(...chunk);
        }

        return {
          scope: "account",
          interval,
          from: range.from,
          to: range.to,
          requests: windows.length,
          totals: summarizeStats(items),
          ...(input.include_series ? { series: items } : {}),
        };
      }

      const adIds = input.ad_ids ?? [];
      if (adIds.length === 0) {
        throw new Error("ad_ids is required when scope is ad.");
      }

      const byAd: Array<{
        ad_id: number;
        totals: ReturnType<typeof summarizeStats>;
        series?: AdStatItem[];
      }> = [];
      const allItems: AdStatItem[] = [];

      for (const adId of adIds) {
        const items: AdStatItem[] = [];
        for (const window of windows) {
          const chunk = await ctx.client.call<AdStatItem[]>(
            "getAdStats",
            compact({
              account_id: input.account_id,
              ad_id: adId,
              from_time: window.from,
              to_time: window.to,
              interval,
            }),
          );
          items.push(...chunk);
        }
        allItems.push(...items);
        byAd.push({
          ad_id: adId,
          totals: summarizeStats(items),
          ...(input.include_series ? { series: items } : {}),
        });
      }

      return {
        scope: "ad",
        interval,
        from: range.from,
        to: range.to,
        requests: windows.length * adIds.length,
        totals: summarizeStats(allItems),
        by_ad: byAd,
      };
    }),
  );

  server.registerTool(
    "tg_get_report",
    {
      title: "Get monthly account report",
      description:
        "Get Telegram's monthly report for all active ads in an account, including views, opens, clicks, " +
        "actions and spend per ad.",
      inputSchema: z.object({
        year: z.number().int().min(2024).max(2100),
        month: z.number().int().min(1).max(12),
        account_id: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_report", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const report = await ctx.client.call<AccountReportItem[]>(
        "getAccountReport",
        compact({ account_id: input.account_id, year: input.year, month: input.month }),
      );
      return { year: input.year, month: input.month, items: report };
    }),
  );
}
