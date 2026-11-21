import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Pixel, PixelEvent, PixelEventsList } from "../api/types.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";

const eventType = z.enum([
  "page_view",
  "add_to_cart",
  "add_to_wishlist",
  "customize_product",
  "initiate_checkout",
  "add_payment_info",
  "purchase",
  "contact",
  "lead",
  "schedule",
  "complete_registration",
  "submit_application",
  "start_trial",
  "subscribe",
  "view_content",
  "search",
  "find_location",
  "donate",
  "custom",
]);

export function registerPixelTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_get_pixel",
    {
      title: "Get pixel",
      description:
        "Get the account's Pixel Tag, including its ID and the HTML code snippet used to install it on a website.",
      inputSchema: z.object({
        account_id: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_pixel", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const pixel = await ctx.client.call<Pixel>(
        "getPixel",
        compact({ account_id: input.account_id }),
      );
      return { pixel };
    }),
  );

  server.registerTool(
    "tg_list_pixel_events",
    {
      title: "List pixel events",
      description:
        "List conversion events for the account's pixel, or fetch specific events by ID.",
      inputSchema: z.object({
        event_ids: z.array(z.string().min(1)).max(100).optional(),
        account_id: z.string().optional(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_list_pixel_events", async (input) => {
      ctx.policy.assertAccount(input.account_id);

      if (input.event_ids && input.event_ids.length > 0) {
        const events = await ctx.client.call<PixelEvent[]>(
          "getPixelEventsById",
          compact({ account_id: input.account_id, event_ids: input.event_ids }),
        );
        return { events };
      }

      const result = await ctx.client.call<PixelEventsList>(
        "getPixelEventsList",
        compact({ account_id: input.account_id, offset: input.offset, limit: input.limit }),
      );
      return result;
    }),
  );

  server.registerTool(
    "tg_manage_pixel",
    {
      title: "Manage pixel and conversion events",
      description:
        "action=create_pixel creates the account's Pixel Tag (only one per account); " +
        "action=create_event needs title and type; action=update_event renames an event; " +
        "action=delete_event removes an event that is not used by any ad. " +
        "Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        action: z.enum(["create_pixel", "create_event", "update_event", "delete_event"]),
        event_id: z.string().min(1).optional(),
        title: z.string().min(1).max(64).optional(),
        type: eventType.optional().describe("Event type, for example purchase or lead."),
        account_id: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_manage_pixel", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      ctx.policy.assertWrite(input.confirm);

      if (input.action === "create_pixel") {
        const result = await ctx.client.write<Pixel>(
          "createPixel",
          compact({ account_id: input.account_id }),
        );
        return { pixel: result.data, idempotency_key: result.idempotencyKey };
      }

      if (input.action === "create_event") {
        if (!input.title) throw new Error("title is required when action=create_event.");
        if (!input.type) throw new Error("type is required when action=create_event.");
        const result = await ctx.client.write<PixelEvent>(
          "createPixelEvent",
          compact({
            account_id: input.account_id,
            title: input.title,
            type: input.type,
          }),
        );
        return { event: result.data, idempotency_key: result.idempotencyKey };
      }

      if (!input.event_id) throw new Error("event_id is required for event actions.");

      if (input.action === "update_event") {
        if (!input.title) throw new Error("title is required when action=update_event.");
        const result = await ctx.client.write<PixelEvent>(
          "editPixelEvent",
          compact({
            account_id: input.account_id,
            event_id: input.event_id,
            title: input.title,
          }),
        );
        return { event: result.data, idempotency_key: result.idempotencyKey };
      }

      await ctx.client.write(
        "deletePixelEvent",
        compact({
          account_id: input.account_id,
          event_id: input.event_id,
        }),
      );
      return { deleted: true, event_id: input.event_id };
    }),
  );
}
