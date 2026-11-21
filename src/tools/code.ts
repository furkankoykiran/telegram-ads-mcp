import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildSdkDts, searchMethods } from "../code-mode/sdk.js";
import { runCode } from "../code-mode/run.js";
import { isWriteMethod } from "../api/catalog.js";
import type { Params } from "../api/client.js";
import { toolHandler, type ToolContext } from "./helpers.js";

export function registerCodeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "tg_search",
    {
      title: "Search Telegram Ads methods",
      description:
        "Search the official Telegram Ads API methods by name, description or parameter. " +
        "Use this to discover the right method before calling tg_api_call or writing a tg_execute script. " +
        "Returns names, descriptions, write flags, return types and full parameter signatures.",
      inputSchema: z.object({
        query: z.string().optional().describe("Empty returns all methods."),
        write: z.boolean().optional().describe("Only return methods that change state."),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    toolHandler(ctx, "tg_search", async (input) => {
      const methods = searchMethods(input.query ?? "", input.limit ?? 10, input.write);
      return { count: methods.length, methods };
    }),
  );

  server.registerTool(
    "tg_get_sdk",
    {
      title: "Get the Code Mode TypeScript SDK",
      description:
        "Return the TypeScript declarations for the tg namespace available inside tg_execute. " +
        "Read this before writing a non-trivial script; it documents every method signature.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    toolHandler(ctx, "tg_get_sdk", async () => ({ sdk: buildSdkDts() })),
  );

  server.registerTool(
    "tg_execute",
    {
      title: "Execute a Telegram Ads script",
      description:
        "Run JavaScript in an isolated QuickJS sandbox with a typed tg object, for multi-step work that " +
        "would otherwise need many tool calls: bulk edits, cross-ad analysis, pagination, joins and reports. " +
        "Only console.log output and the returned value come back. No network, filesystem, process or env " +
        "access. Calls run sequentially; the limit is 25 API calls, 15 seconds and 64 KB of output. " +
        "Example: `const ads = await tg.getAdsList({limit: 100}); return ads.ads.length`. " +
        "Write methods require TG_ADS_MODE=write, TG_ADS_CODE_MODE=write and confirm: true.",
      inputSchema: z.object({
        code: z
          .string()
          .min(1)
          .max(20_000)
          .describe("An async arrow function, a function expression, or a plain statement body."),
        confirm: z.boolean().optional().describe("Required before any write method can run."),
        idempotency_key: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Prefix for write idempotency keys, useful when retrying a script."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    toolHandler(ctx, "tg_execute", async (input) => {
      if (!ctx.policy.codeModeEnabled) {
        throw new Error(
          "Code Mode is disabled. Set TG_ADS_CODE_MODE=read-only or write to enable it.",
        );
      }

      const allowWrite =
        ctx.policy.canWrite && ctx.policy.codeModeCanWrite && input.confirm === true;
      let writeIndex = 0;

      const result = await runCode({
        code: input.code,
        allowWrite,
        isWrite: isWriteMethod,
        call: async (method: string, params: Params) => {
          if (!isWriteMethod(method)) return ctx.client.call(method, params);

          ctx.policy.assertCodeModeWrite(input.confirm);
          writeIndex += 1;
          const key = input.idempotency_key
            ? `${input.idempotency_key}-${writeIndex}`.slice(0, 128)
            : undefined;
          const written = await ctx.client.write(
            method,
            params,
            key ? { idempotencyKey: key } : {},
          );
          return written.data;
        },
      });

      return result;
    }),
  );
}
