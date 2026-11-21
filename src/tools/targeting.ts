import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type {
  TargetBot,
  TargetChannel,
  TargetCountry,
  TargetLanguage,
  TargetLocation,
  TargetLocationList,
  TargetTopic,
} from "../api/types.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";
import { idOrUsername } from "./schemas.js";

export function registerTargetingTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_list_targeting",
    {
      title: "List targeting options",
      description:
        "Look up targeting catalogs. kind=languages, topics or countries takes no extra arguments. " +
        "kind=locations searches by country_code and/or query, or resolves location_ids. " +
        "kind=channel resolves a channel by @username or numeric ID; kind=bot does the same for bots. " +
        "Prefer @username for channels and bots: numeric IDs only work after this account has resolved them.",
      inputSchema: z.object({
        kind: z.enum(["languages", "topics", "countries", "locations", "channel", "bot"]),
        country_code: z.string().length(2).optional().describe("Required for location search."),
        query: z.string().optional().describe("Location search text."),
        location_ids: z.array(z.number().int().positive()).max(100).optional(),
        offset: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        channel: idOrUsername.optional(),
        bot: idOrUsername.optional(),
        for_excluding: z.boolean().optional(),
        account_id: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_list_targeting", async (input) => {
      ctx.policy.assertAccount(input.account_id);

      switch (input.kind) {
        case "languages": {
          const languages = await ctx.client.call<TargetLanguage[]>("getTargetLanguagesList");
          return { languages };
        }
        case "topics": {
          const topics = await ctx.client.call<TargetTopic[]>("getTargetTopicsList");
          return { topics };
        }
        case "countries": {
          const countries = await ctx.client.call<TargetCountry[]>("getTargetCountriesList");
          return { countries };
        }
        case "locations": {
          if (input.location_ids && input.location_ids.length > 0) {
            const locations = await ctx.client.call<TargetLocation[]>("getTargetLocationsById", {
              location_ids: input.location_ids,
            });
            return { locations };
          }
          if (!input.country_code) {
            throw new Error("country_code is required when searching locations by text.");
          }
          const result = await ctx.client.call<TargetLocationList>(
            "getTargetLocationsList",
            compact({
              country_code: input.country_code,
              query: input.query,
              offset: input.offset,
              limit: input.limit,
            }),
          );
          return result;
        }
        case "channel": {
          if (input.channel === undefined) throw new Error("channel is required for kind=channel.");
          const channel = await ctx.client.call<TargetChannel>(
            "getTargetChannel",
            compact({ channel_id: input.channel, for_excluding: input.for_excluding }),
          );
          return { channel };
        }
        case "bot": {
          if (input.bot === undefined) throw new Error("bot is required for kind=bot.");
          const bot = await ctx.client.call<TargetBot>("getTargetBot", { bot_id: input.bot });
          return { bot };
        }
      }
    }),
  );
}
