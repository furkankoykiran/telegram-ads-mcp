import { registerAccountTools } from "./account.js";
import { registerAdTools } from "./ads.js";
import { registerAudienceTools } from "./audiences.js";
import { registerCodeTools } from "./code.js";
import { registerPixelTools } from "./pixels.js";
import { registerRawTools } from "./raw.js";
import { registerStatsTools } from "./stats.js";
import { registerTargetingTools } from "./targeting.js";
import { registerTransactionTools } from "./transactions.js";
import type { ToolContext } from "./helpers.js";
import type { McpServer } from "@modelcontextprotocol/server";

export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerAccountTools(server, ctx);
  registerAdTools(server, ctx);
  registerStatsTools(server, ctx);
  registerTargetingTools(server, ctx);
  registerAudienceTools(server, ctx);
  registerPixelTools(server, ctx);
  registerTransactionTools(server, ctx);
  registerCodeTools(server, ctx);
  registerRawTools(server, ctx);
}

export type { ToolContext };
