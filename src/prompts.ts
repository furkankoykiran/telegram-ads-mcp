import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "launch-ad",
    {
      title: "Launch a Telegram ad safely",
      description:
        "Walk through account discovery, targeting, paused ad creation, validation and funding.",
      argsSchema: z.object({
        brief: z.string().min(1).describe("What to promote, the target audience and the budget."),
      }),
    },
    ({ brief }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Plan and launch a Telegram ad for this brief:\n\n${brief}\n\n` +
              `Follow this order strictly:\n` +
              `1. Call tg_get_account to learn the account currency and available budget.\n` +
              `2. Use tg_list_targeting to resolve languages, topics, countries, locations, channels or bots. ` +
              `Prefer @username for channels and bots.\n` +
              `3. Call tg_create_ad with dry_run: true and is_paused: true. Show me the exact payload and cost implications.\n` +
              `4. Ask for my approval before creating anything that spends money.\n` +
              `5. Create the ad paused with a zero initial budget, then show me its ad_id.\n` +
              `6. Only after I approve the budget, call tg_ad_budget and tg_update_ad to unpause it.\n\n` +
              `Never submit an ad for review without asking me. Never exceed the configured budget caps.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "audit-account",
    {
      title: "Audit account performance",
      description: "Read-only review of spend, delivery and underperforming ads.",
      argsSchema: z.object({
        days: z.string().optional().describe("Lookback window in days, default 30."),
      }),
    },
    ({ days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Audit my Telegram Ads account for the last ${days ?? "30"} days. Stay read-only.\n\n` +
              `1. tg_get_account for currency and remaining budget.\n` +
              `2. tg_list_ads with include_targeting: false, paging through all active ads.\n` +
              `3. tg_get_stats for those ads with include_series: true and interval 86400.\n` +
              `4. Identify: zero-delivery ads, CTR outliers, CPM outliers, ads with spend but no clicks, ` +
              `and ads whose budget is nearly exhausted.\n` +
              `5. Return a compact table plus a prioritized list of actions. Do not change anything.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "weekly-report",
    {
      title: "Weekly performance report",
      description: "Aggregate a week of stats into a compact report.",
      argsSchema: z.object({
        week_offset: z.string().optional().describe("0 is the current week, 1 is last week."),
      }),
    },
    ({ week_offset }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Build a weekly Telegram Ads report for week offset ${week_offset ?? "1"} (0 = current week).\n\n` +
              `Use tg_execute for efficiency: fetch the active ads, pull daily stats for the week, then return ` +
              `per-ad spend, views, clicks, CTR, CPM and week-over-week change. Keep the returned object small ` +
              `and sorted by spend. Do not make any write calls.`,
          },
        },
      ],
    }),
  );
}
