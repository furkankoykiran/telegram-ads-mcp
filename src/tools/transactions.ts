import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type {
  AccountTransactionsList,
  AdTransactionsList,
  TransactionStatus,
} from "../api/types.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";

export function registerTransactionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_list_transactions",
    {
      title: "List transactions",
      description:
        "List account-level or ad-level transactions. Use next_offset to page. " +
        "Transactions explain where budget was added or spent.",
      inputSchema: z.object({
        scope: z.enum(["account", "ad"]),
        ad_id: z.number().int().positive().optional(),
        account_id: z.string().optional(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_list_transactions", async (input) => {
      ctx.policy.assertAccount(input.account_id);

      if (input.scope === "ad") {
        if (input.ad_id === undefined) throw new Error("ad_id is required when scope=ad.");
        const result = await ctx.client.call<AdTransactionsList>(
          "getAdTransactionsList",
          compact({
            account_id: input.account_id,
            ad_id: input.ad_id,
            offset: input.offset,
            limit: input.limit,
          }),
        );
        return result;
      }

      const result = await ctx.client.call<AccountTransactionsList>(
        "getAccountTransactionsList",
        compact({ account_id: input.account_id, offset: input.offset, limit: input.limit }),
      );
      return result;
    }),
  );

  server.registerTool(
    "tg_get_transaction",
    {
      title: "Get transaction status",
      description: "Check the status of a budget transaction by its transaction ID.",
      inputSchema: z.object({
        transaction_id: z.string().min(1),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_transaction", async (input) => {
      const status = await ctx.client.call<TransactionStatus>("getTransactionStatus", {
        transaction_id: input.transaction_id,
      });
      return { transaction: status };
    }),
  );
}
