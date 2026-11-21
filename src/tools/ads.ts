import { stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Ad, AdList } from "../api/types.js";
import { compact, toolHandler, type ToolContext } from "./helpers.js";
import { assertTargetLimits, targetSchema } from "./schemas.js";

const placement = z.enum(["channel_post", "bot_banner", "search_result", "video_banner"]);
const button = z.enum([
  "subscribe",
  "view",
  "read",
  "learn_more",
  "download",
  "open",
  "sign_up",
  "buy",
  "order",
  "play",
  "try",
  "leave_request",
]);

const schedule = z.object({
  week_hours_mask: z
    .array(z.number().int().min(0).max(16_777_215))
    .length(7)
    .describe(
      "Exactly 7 bitmasks, Monday first. Bit 0 is 00:00-01:00, bit 23 is 23:00-00:00. All zeros means no schedule.",
    ),
  timezone: z
    .number()
    .int()
    .min(-43_200)
    .max(50_400)
    .multipleOf(900)
    .optional()
    .describe("Offset in seconds from UTC. Required unless use_viewer_timezone is true."),
  use_viewer_timezone: z
    .boolean()
    .optional()
    .describe("Apply the schedule in the viewer's timezone. Users targeting only."),
});

const money = z.number().nonnegative();

const httpUrl = z
  .string()
  .url()
  .max(256)
  .refine((value) => /^https?:\/\//i.test(value), "Use an http:// or https:// URL.");

export function registerAdTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_list_ads",
    {
      title: "List ads",
      description:
        "List advertisements for an account, newest first, with status, budgets and lifetime metrics. " +
        "Use next_offset from the response to fetch the next page. " +
        "Set include_targeting to receive targeting settings (larger response).",
      inputSchema: z.object({
        account_id: z.string().optional(),
        offset: z.string().optional().describe("Pagination cursor from a previous response."),
        limit: z.number().int().min(1).max(100).optional(),
        include_targeting: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_list_ads", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const result = await ctx.client.call<AdList>(
        "getAdsList",
        compact({
          account_id: input.account_id,
          offset: input.offset,
          limit: input.limit,
          return_target: input.include_targeting,
        }),
      );
      return result;
    }),
  );

  server.registerTool(
    "tg_get_ads",
    {
      title: "Get ads by ID",
      description:
        "Fetch up to 100 advertisements by ad_id, including status, budgets, metrics and decline reasons.",
      inputSchema: z.object({
        ad_ids: z.array(z.number().int().positive()).min(1).max(100),
        account_id: z.string().optional(),
        include_targeting: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_get_ads", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const ads = await ctx.client.call<Ad[]>(
        "getAdsById",
        compact({
          account_id: input.account_id,
          ad_ids: input.ad_ids,
          return_target: input.include_targeting,
        }),
      );
      return { ads };
    }),
  );

  server.registerTool(
    "tg_create_ad",
    {
      title: "Create ad",
      description:
        "Create one advertisement. New ads are paused with a zero budget unless you pass is_paused: false " +
        "and initial_budget. Money values must match the account currency precision (EUR/TON: 2 decimals, " +
        "XTR: 0). Telegram requires text unless target.type is search, and at most one of photo_id/video_id. " +
        "Use dry_run: true to validate without calling the API. Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        title: z.string().min(1).max(128),
        text: z.string().min(1).max(160).optional(),
        promote_url: httpUrl,
        cpm: z.number().positive().describe("Price per 1000 impressions in the account currency."),
        placement,
        target: targetSchema,
        photo_id: z.string().min(1).optional(),
        video_id: z.string().min(1).optional(),
        website_name: z.string().min(1).max(40).optional(),
        website_photo_id: z.string().optional(),
        button: button.optional(),
        conversion_event_id: z.string().optional(),
        additional_info: z.string().optional(),
        show_userpic: z.boolean().optional(),
        impression_frequency: z.number().int().min(1).max(4).optional(),
        initial_budget: money.optional().describe("Defaults to 0, which keeps the ad unfunded."),
        daily_budget_limit: money.optional().describe("0 disables the daily limit."),
        activate_date: z.number().int().positive().optional().describe("Unix seconds."),
        deactivate_date: z.number().int().positive().optional().describe("Unix seconds."),
        schedule: schedule.optional(),
        is_paused: z.boolean().optional().describe("Defaults to true."),
        account_id: z.string().optional(),
        dry_run: z.boolean().optional(),
        confirm: z.boolean().optional(),
        idempotency_key: z.string().min(1).max(128).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(ctx, "tg_create_ad", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      assertTargetLimits(input.target);
      if (input.photo_id && input.video_id) {
        throw new Error("Only one of photo_id or video_id may be provided.");
      }
      if (
        (input.photo_id || input.video_id) &&
        !["channels", "users"].includes(input.target.type)
      ) {
        throw new Error(
          "photo_id and video_id are only supported for channels or users targeting.",
        );
      }
      if (!input.text && input.target.type !== "search") {
        throw new Error("text is required unless target.type is search.");
      }

      const currency = await ctx.client.resolveCurrency(input.account_id);
      ctx.policy.assertCpm(input.cpm, currency);

      const initialBudget = input.initial_budget ?? 0;
      if (initialBudget > 0) ctx.policy.assertAdBudget(initialBudget, currency);
      if (input.daily_budget_limit !== undefined && input.daily_budget_limit > 0) {
        ctx.policy.assertDailyBudget(input.daily_budget_limit, currency);
      }

      const params = compact({
        account_id: input.account_id,
        title: input.title,
        text: input.text,
        promote_url: input.promote_url,
        cpm: input.cpm,
        placement: input.placement,
        target: input.target,
        photo_id: input.photo_id,
        video_id: input.video_id,
        website_name: input.website_name,
        website_photo_id: input.website_photo_id,
        button: input.button,
        conversion_event_id: input.conversion_event_id,
        additional_info: input.additional_info,
        show_userpic: input.show_userpic,
        impression_frequency: input.impression_frequency,
        initial_budget: initialBudget,
        daily_budget_limit: input.daily_budget_limit,
        activate_date: input.activate_date,
        deactivate_date: input.deactivate_date,
        schedule: input.schedule,
        is_paused: input.is_paused ?? true,
      });

      if (input.dry_run) {
        return { dry_run: true, currency, request: params };
      }

      ctx.policy.assertWrite(input.confirm);
      const result = await ctx.client.write<Ad>("createAd", params, {
        ...(input.idempotency_key ? { idempotencyKey: input.idempotency_key } : {}),
      });
      return { ad: result.data, idempotency_key: result.idempotencyKey };
    }),
  );

  server.registerTool(
    "tg_update_ad",
    {
      title: "Update ad",
      description:
        "Edit an existing advertisement. Only provided fields change. Use is_paused to pause or resume. " +
        "Set submit_for_review: true to move a ready_for_review ad into review after editing. " +
        "Changing cpm or budget requires the same currency precision rules as creation. " +
        "Use dry_run: true to validate without calling the API. Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        ad_id: z.number().int().positive(),
        title: z.string().min(1).max(128).optional(),
        text: z.string().min(1).max(160).optional(),
        promote_url: httpUrl.optional(),
        cpm: z.number().positive().optional(),
        photo_id: z.string().min(1).optional(),
        video_id: z.string().min(1).optional(),
        website_name: z.string().min(1).max(40).optional(),
        website_photo_id: z.string().optional(),
        button: button.optional(),
        conversion_event_id: z.string().optional(),
        additional_info: z.string().optional(),
        show_userpic: z.boolean().optional(),
        impression_frequency: z.number().int().min(1).max(4).optional(),
        daily_budget_limit: money.optional(),
        is_paused: z.boolean().optional(),
        activate_date: z.number().int().positive().optional(),
        deactivate_date: z.number().int().positive().optional(),
        schedule: schedule.optional(),
        submit_for_review: z.boolean().optional(),
        include_targeting: z.boolean().optional(),
        account_id: z.string().optional(),
        dry_run: z.boolean().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_update_ad", async (input) => {
      ctx.policy.assertAccount(input.account_id);

      const {
        ad_id,
        submit_for_review,
        include_targeting,
        dry_run,
        confirm,
        account_id,
        ...fields
      } = input;
      const provided = Object.entries(fields).filter(([, value]) => value !== undefined);
      if (provided.length === 0 && !submit_for_review) {
        throw new Error("Provide at least one field to update, or set submit_for_review: true.");
      }
      if (fields.photo_id && fields.video_id) {
        throw new Error("Only one of photo_id or video_id may be provided.");
      }

      const currency = await ctx.client.resolveCurrency(account_id);
      if (fields.cpm !== undefined) ctx.policy.assertCpm(fields.cpm, currency);
      if (fields.daily_budget_limit !== undefined && fields.daily_budget_limit > 0) {
        ctx.policy.assertDailyBudget(fields.daily_budget_limit, currency);
      }

      const params = compact({
        account_id,
        ad_id,
        ...fields,
        return_target: include_targeting,
      });

      if (dry_run) {
        return {
          dry_run: true,
          currency,
          request: params,
          submit_for_review: submit_for_review ?? false,
        };
      }

      ctx.policy.assertWrite(confirm);
      const response: Record<string, unknown> = {};

      if (provided.length > 0) {
        const result = await ctx.client.write<Ad>("editAd", params);
        response.ad = result.data;
        response.idempotency_key = result.idempotencyKey;
      }

      if (submit_for_review) {
        const review = await ctx.client.write<Ad>(
          "submitAdForReview",
          compact({ account_id, ad_id }),
        );
        response.submitted = review.data;
        response.submit_idempotency_key = review.idempotencyKey;
      }

      return response;
    }),
  );

  server.registerTool(
    "tg_ad_budget",
    {
      title: "Increase or decrease ad budget",
      description:
        "Move funds into or out of an ad. amount is in the account currency and must respect its precision. " +
        "Telegram only allows decreasing budget when the ad has been inactive for at least 10 minutes. " +
        "Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        ad_id: z.number().int().positive(),
        direction: z.enum(["increase", "decrease"]),
        amount: z.number().positive(),
        include_targeting: z.boolean().optional(),
        account_id: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_ad_budget", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const currency = await ctx.client.resolveCurrency(input.account_id);
      ctx.policy.assertAmount(input.amount, currency);
      ctx.policy.assertWrite(input.confirm);

      const method = input.direction === "increase" ? "increaseAdBudget" : "decreaseAdBudget";
      const result = await ctx.client.write<Ad>(
        method,
        compact({
          account_id: input.account_id,
          ad_id: input.ad_id,
          amount: input.amount,
          return_target: input.include_targeting,
        }),
      );
      return { ad: result.data, idempotency_key: result.idempotencyKey };
    }),
  );

  server.registerTool(
    "tg_delete_ad",
    {
      title: "Delete ad",
      description:
        "Permanently delete an advertisement. Telegram requires the ad to be inactive for at least 10 minutes " +
        "and to have no remaining budget. Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        ad_id: z.number().int().positive(),
        account_id: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_delete_ad", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      ctx.policy.assertWrite(input.confirm);
      await ctx.client.write(
        "deleteAd",
        compact({ account_id: input.account_id, ad_id: input.ad_id }),
      );
      return { deleted: true, ad_id: input.ad_id };
    }),
  );

  const uploadLimits = {
    ad_photo: {
      method: "uploadAdPhoto",
      maxBytes: 5 * 1024 * 1024,
      extensions: [".jpg", ".jpeg", ".png"],
    },
    ad_video: { method: "uploadAdVideo", maxBytes: 20 * 1024 * 1024, extensions: [".mp4"] },
    website_photo: {
      method: "uploadWebsitePhoto",
      maxBytes: 1 * 1024 * 1024,
      extensions: [".jpg", ".jpeg", ".png"],
    },
  } as const;

  server.registerTool(
    "tg_upload_media",
    {
      title: "Upload ad media",
      description:
        "Upload a local file to Telegram Ads and return its media ID. Limits: ad_photo JPEG/PNG up to 5 MiB " +
        "and at least 640px wide; ad_video MP4 up to 20 MiB, 16:9, 3-60 seconds; website_photo JPEG/PNG up to " +
        "1 MiB and at least 150x150. Requires confirm: true and TG_ADS_MODE=write.",
      inputSchema: z.object({
        kind: z.enum(["ad_photo", "ad_video", "website_photo"]),
        path: z
          .string()
          .min(1)
          .describe("Absolute path, or a path relative to the server process."),
        account_id: z.string().optional(),
        confirm: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    toolHandler(ctx, "tg_upload_media", async (input) => {
      ctx.policy.assertAccount(input.account_id);
      const limits = uploadLimits[input.kind];
      const filePath = resolve(input.path);
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error(`${filePath} is not a file.`);

      const extension = extname(filePath).toLowerCase();
      if (!(limits.extensions as readonly string[]).includes(extension)) {
        throw new Error(
          `${input.kind} must be one of ${limits.extensions.join(", ")}; received ${extension || "no extension"}.`,
        );
      }
      if (info.size > limits.maxBytes) {
        throw new Error(
          `${filePath} is ${info.size} bytes, above the ${limits.maxBytes} byte limit for ${input.kind}.`,
        );
      }

      ctx.policy.assertWrite(input.confirm);
      const result = await ctx.client.upload<Record<string, string>>(
        limits.method,
        compact({ account_id: input.account_id }),
        { path: filePath },
      );
      return { kind: input.kind, ...result.data, idempotency_key: result.idempotencyKey };
    }),
  );
}
