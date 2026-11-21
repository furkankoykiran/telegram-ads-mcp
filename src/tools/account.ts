import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { RelatedAccountsList, TransactionStatus } from "../api/types.js";
import { TelegramAdsError } from "../errors.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";

export function registerAccountTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_get_account",
    {
      title: "Get Telegram Ads account",
      description:
        "Get the current Telegram Ads account: account_id, title, currency, remaining budget and ad budget. " +
        "Set include_related to also list accounts whose budgets this account can replenish. " +
        "Start here to learn the account currency, which determines valid CPM and budget precision.",
      inputSchema: z.object({
        include_related: z
          .boolean()
          .optional()
          .describe("Also list related accounts that this account can fund."),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_account", async (input) => {
      const account = await ctx.client.getCurrentAccount();
      if (!input.include_related) return { account };

      try {
        const related = await ctx.client.call<RelatedAccountsList>(
          "getRelatedAccountsList",
          compact({ offset: input.offset, limit: input.limit }),
        );
        return { account, related };
      } catch (error) {
        if (error instanceof TelegramAdsError && error.code === "MAIN_ACCOUNT_REQUIRED") {
          return {
            account,
            related: null,
            note: "Related accounts are only available to main (agency) accounts.",
          };
        }
        throw error;
      }
    }),
  );

  server.registerTool(
    "tg_get_account_info",
    {
      title: "Get account profile",
      description:
        "Get the billing/profile details of an account (company name, email, phone, country, city). " +
        "Omit account_id to read the current account.",
      inputSchema: z.object({
        account_id: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_account_info", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const info = await ctx.client.call(
        "getAccountInfo",
        compact({ account_id: input.account_id }),
      );
      return { account_info: info };
    }),
  );

  server.registerTool(
    "tg_account_budget",
    {
      title: "Move budget between accounts",
      description:
        "Increase or decrease the budget of a related account from the current account. " +
        "amount uses the currency's amount precision (EUR/TON: 5 decimals, XTR: 3). " +
        "Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        account_id: z.string().min(1).describe("Related account to fund or withdraw from."),
        direction: z.enum(["increase", "decrease"]),
        amount: z.number().positive(),
        confirm: z.boolean().optional(),
        idempotency_key: z.string().min(1).max(128).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_account_budget", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const currency = await ctx.client.resolveCurrency(input.account_id);
      ctx.policy.assertAmount(input.amount, currency);
      ctx.policy.assertWrite(input.confirm);

      const method =
        input.direction === "increase" ? "increaseAccountBudget" : "decreaseAccountBudget";
      const result = await ctx.client.write<TransactionStatus>(
        method,
        { account_id: input.account_id, amount: input.amount },
        input.idempotency_key ? { idempotencyKey: input.idempotency_key } : {},
      );
      return { transaction: result.data, idempotency_key: result.idempotencyKey };
    }),
  );
}
