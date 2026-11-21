import { z } from "zod";

export const idOrUsername = z.union([z.string().min(1), z.number().int().positive()]);

const languages = z.array(z.string().min(2).max(16)).max(8);
const topicIds = z.array(z.number().int().positive()).max(20);
const channelIds = z.array(idOrUsername).max(100);
const audienceIds = z.array(z.number().int().positive()).max(10);

export const targetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("channels"),
    language_codes: languages
      .optional()
      .describe("Channel languages (up to 8 IETF tags). Must be empty when channel_ids is used."),
    topic_ids: topicIds
      .optional()
      .describe("Channel topics (up to 20). Must be empty when channel_ids is used."),
    exclude_topic_ids: topicIds.optional(),
    channel_ids: channelIds
      .optional()
      .describe("Channels to include, as @username or numeric ID resolved by this account."),
    exclude_channel_ids: channelIds.optional(),
  }),
  z.object({
    type: z.literal("users"),
    country_codes: z
      .array(z.string().length(2))
      .max(8)
      .describe(
        "ISO 3166-1 alpha-2 country codes (up to 8). Exactly one when location_ids is used.",
      ),
    location_ids: z.array(z.number().int().positive()).max(20).optional(),
    language_codes: languages.optional(),
    topic_ids: topicIds.optional(),
    intersect_topics: z.boolean().optional(),
    exclude_topic_ids: topicIds.optional(),
    channel_ids: channelIds.optional(),
    exclude_channel_ids: channelIds.optional(),
    audience_ids: audienceIds.optional(),
    exclude_audience_ids: audienceIds.optional(),
    device: z.enum(["ios", "android", "mobile", "desktop"]).optional(),
    exclude_political_channels: z.boolean().optional(),
    political_channels_only: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("bots"),
    bot_ids: z.array(idOrUsername).max(100).describe("Bots to target, as @username or numeric ID."),
  }),
  z.object({
    type: z.literal("search"),
    search_queries: z.array(z.string().min(1).max(64)).min(1).max(10),
  }),
]);

export type Target = z.infer<typeof targetSchema>;

/**
 * Telegram limits included and excluded values together, so per-field array
 * limits are not enough. Catching this here produces a clearer error than the
 * API response.
 */
export function assertTargetLimits(target: Target): void {
  if (target.type === "channels") {
    if (target.channel_ids?.length && (target.topic_ids?.length || target.language_codes?.length)) {
      throw new Error("channel_ids cannot be combined with topic_ids or language_codes.");
    }
    assertCombined(target.topic_ids, target.exclude_topic_ids, 20, "topics");
    assertCombined(target.channel_ids, target.exclude_channel_ids, 100, "channels");
  }

  if (target.type === "users") {
    assertCombined(target.topic_ids, target.exclude_topic_ids, 20, "topics");
    assertCombined(target.channel_ids, target.exclude_channel_ids, 100, "channels");
    assertCombined(target.audience_ids, target.exclude_audience_ids, 10, "audiences");
    if (target.location_ids?.length && target.country_codes.length !== 1) {
      throw new Error("country_codes must contain exactly one country when location_ids is used.");
    }
  }
}

function assertCombined(
  included: unknown[] | undefined,
  excluded: unknown[] | undefined,
  limit: number,
  label: string,
): void {
  const total = (included?.length ?? 0) + (excluded?.length ?? 0);
  if (total > limit) {
    throw new Error(
      `Included and excluded ${label} may contain at most ${limit} entries combined.`,
    );
  }
}
