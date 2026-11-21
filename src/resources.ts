import type { McpServer } from "@modelcontextprotocol/server";
import { API_METHODS } from "./api/catalog.js";
import { buildSdkDts } from "./code-mode/sdk.js";

const GUIDE = `# Telegram Ads MCP

This server wraps the official Telegram Ads API (https://ads.telegram.org/docs/api).
It is unofficial and not affiliated with Telegram.

## Safe workflow

1. Read first: tg_get_account, tg_list_ads, tg_get_ads, tg_get_stats.
2. Validate writes with dry_run: true when the tool supports it.
3. Writes require TG_ADS_MODE=write and an explicit confirm: true.
4. New ads default to paused with a zero budget. Fund them deliberately.
5. Budget changes are real money. Check the account currency and precision first.

## Currency precision

- EUR and TON: CPM/budget 2 decimals, amounts 5 decimals.
- XTR: CPM/budget 0 decimals, amounts 3 decimals.

## Channels and bots

Prefer @username. Numeric IDs only work after this account has resolved the
same channel or bot via its username.

## Code Mode

tg_execute runs JavaScript in QuickJS with a tg object. Use tg_get_sdk for the
full TypeScript surface, or tg_search to discover methods. Code Mode is
read-only unless TG_ADS_MODE=write and TG_ADS_CODE_MODE=write are both set and
the call includes confirm: true.

## Limits

- Stats: interval 300 or 86400 seconds, at most 1000 intervals per request.
- getAdsById/getAccountsById/getAudiencesById: up to 100 IDs.
- Ad photo: JPEG/PNG, 5 MiB, at least 640px wide, 16:9.
- Ad video: MP4, 20 MiB, 16:9, 3-60 seconds.
- Website photo: JPEG/PNG, 1 MiB, at least 150x150.
- No published rate limits. Calls are sequential and retried with backoff.
`;

export function registerResources(server: McpServer): void {
  server.registerResource(
    "method-catalog",
    "telegram-ads://method-catalog",
    {
      title: "Telegram Ads method catalog",
      description:
        "All 45 official methods with parameters, required flags, descriptions and return types.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              source: "https://ads.telegram.org/docs/api",
              count: API_METHODS.length,
              methods: API_METHODS,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    "code-mode-sdk",
    "telegram-ads://sdk.d.ts",
    {
      title: "Code Mode TypeScript SDK",
      description: "Type declarations for the tg object available inside tg_execute.",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: buildSdkDts() }],
    }),
  );

  server.registerResource(
    "guide",
    "telegram-ads://guide",
    {
      title: "Usage and safety guide",
      description: "Workflow, currency precision, limits and Code Mode rules.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }],
    }),
  );
}
