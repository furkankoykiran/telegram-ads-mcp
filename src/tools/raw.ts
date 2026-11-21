import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getMethod, isWriteMethod } from "../api/catalog.js";
import type { Params } from "../api/client.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";

interface MoneyRule {
  field: string;
  kind: "cpm" | "ad" | "daily" | "amount";
}

const MONEY_RULES: Record<string, MoneyRule[]> = {
  createAd: [
    { field: "cpm", kind: "cpm" },
    { field: "initial_budget", kind: "ad" },
    { field: "daily_budget_limit", kind: "daily" },
  ],
  editAd: [
    { field: "cpm", kind: "cpm" },
    { field: "daily_budget_limit", kind: "daily" },
  ],
  increaseAdBudget: [{ field: "amount", kind: "amount" }],
  decreaseAdBudget: [{ field: "amount", kind: "amount" }],
  increaseAccountBudget: [{ field: "amount", kind: "amount" }],
  decreaseAccountBudget: [{ field: "amount", kind: "amount" }],
};

export function registerRawTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_api_call",
    {
      title: "Call any Telegram Ads API method",
      description:
        "Escape hatch for methods that do not have a dedicated tool. Pass the exact method name from " +
        "tg_search and its parameters. Read methods run immediately; write methods require " +
        "TG_ADS_MODE=write and confirm: true, and receive an idempotency key automatically.",
      inputSchema: z.object({
        method: z
          .string()
          .min(1)
          .describe("Exact method name, for example getTargetLocationsList."),
        params: z.record(z.string(), z.unknown()).optional(),
        confirm: z.boolean().optional(),
        idempotency_key: z.string().min(1).max(128).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_api_call", async (input) => {
      const method = getMethod(input.method);
      if (!method) {
        throw new Error(
          `Unknown method ${input.method}. Use tg_search to find the exact name. Names are case-sensitive.`,
        );
      }
      if (method.deprecated) {
        throw new Error(`${method.name} is deprecated: ${method.description}`);
      }

      const params: Params = input.params ?? {};
      const accountId = typeof params.account_id === "string" ? params.account_id : undefined;
      ctx.policy.assertAccount(accountId);

      const rules = MONEY_RULES[method.name];
      if (rules && rules.length > 0) {
        const currency = await ctx.client.resolveCurrency(accountId);
        for (const rule of rules) {
          const value = params[rule.field];
          if (typeof value !== "number") continue;
          if (rule.kind === "cpm") ctx.policy.assertCpm(value, currency);
          else if (rule.kind === "ad") ctx.policy.assertAdBudget(value, currency, rule.field);
          else if (rule.kind === "daily") ctx.policy.assertDailyBudget(value, currency);
          else ctx.policy.assertAmount(value, currency);
        }
      }

      if (isWriteMethod(method.name)) {
        ctx.policy.assertWrite(input.confirm);
        const result = await ctx.client.write(method.name, params, {
          ...(input.idempotency_key ? { idempotencyKey: input.idempotency_key } : {}),
        });
        return { method: method.name, result: result.data, idempotency_key: result.idempotencyKey };
      }

      const result = await ctx.client.call(method.name, compact(params));
      return { method: method.name, result };
    }),
  );
}
