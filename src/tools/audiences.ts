import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Audience, AudiencesList } from "../api/types.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";

const phone = z
  .string()
  .refine(
    (value) => /^\+?[0-9]{7,15}$/.test(value) || /^[a-f0-9]{64}$/i.test(value),
    "Use a phone number (7-15 digits, optional +) or a 64-character SHA256 hash.",
  );

export function registerAudienceTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_list_audiences",
    {
      title: "List audiences",
      description:
        "List retargeting audiences for an account, or fetch specific audiences by ID. " +
        "Audience sizes are in phone numbers.",
      inputSchema: z.object({
        audience_ids: z.array(z.number().int().positive()).max(100).optional(),
        account_id: z.string().optional(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_list_audiences", async (input) => {
      ctx.policy.assertAccount(input.account_id);

      if (input.audience_ids && input.audience_ids.length > 0) {
        const audiences = await ctx.client.call<Audience[]>(
          "getAudiencesById",
          compact({ account_id: input.account_id, audience_ids: input.audience_ids }),
        );
        return { audiences };
      }

      const result = await ctx.client.call<AudiencesList>(
        "getAudiencesList",
        compact({ account_id: input.account_id, offset: input.offset, limit: input.limit }),
      );
      return result;
    }),
  );

  server.registerTool(
    "tg_manage_audience",
    {
      title: "Create, update or delete an audience",
      description:
        "Manage phone-number retargeting audiences. action=create needs title and add_phones; " +
        "action=update needs audience_id plus at least one change; action=delete needs audience_id. " +
        "Phone numbers are sent to Telegram and are never written to the audit log. " +
        "Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        action: z.enum(["create", "update", "delete"]),
        audience_id: z.number().int().positive().optional(),
        title: z.string().min(1).max(64).optional(),
        add_phones: z.array(phone).max(10_000).optional(),
        remove_phones: z.array(phone).max(10_000).optional(),
        reset_phones: z.boolean().optional(),
        account_id: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_manage_audience", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      ctx.policy.assertWrite(input.confirm);

      if (input.action === "create") {
        if (!input.title) throw new Error("title is required when action=create.");
        if (!input.add_phones?.length)
          throw new Error("add_phones is required when action=create.");
        const result = await ctx.client.write<Audience>(
          "createAudience",
          compact({
            account_id: input.account_id,
            title: input.title,
            add_phones: input.add_phones,
          }),
        );
        return { audience: result.data, idempotency_key: result.idempotencyKey };
      }

      if (input.audience_id === undefined) {
        throw new Error("audience_id is required when action=update or action=delete.");
      }

      if (input.action === "delete") {
        await ctx.client.write(
          "deleteAudience",
          compact({
            account_id: input.account_id,
            audience_id: input.audience_id,
          }),
        );
        return { deleted: true, audience_id: input.audience_id };
      }

      if (
        input.title === undefined &&
        !input.add_phones?.length &&
        !input.remove_phones?.length &&
        input.reset_phones === undefined
      ) {
        throw new Error(
          "Provide title, add_phones, remove_phones or reset_phones to update an audience.",
        );
      }

      const result = await ctx.client.write<Audience>(
        "editAudience",
        compact({
          account_id: input.account_id,
          audience_id: input.audience_id,
          title: input.title,
          add_phones: input.add_phones,
          remove_phones: input.remove_phones,
          reset_phones: input.reset_phones,
        }),
      );
      return { audience: result.data, idempotency_key: result.idempotencyKey };
    }),
  );
}
