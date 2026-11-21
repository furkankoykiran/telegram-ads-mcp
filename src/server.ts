import { McpServer } from "@modelcontextprotocol/server";
import { TelegramAdsClient } from "./api/client.js";
import { AuditLogger } from "./audit.js";
import type { Config } from "./config.js";
import { Policy } from "./policy.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools/index.js";
import { SERVER_NAME, VERSION } from "./version.js";

export interface CreateServerOptions {
  config: Config;
  client?: TelegramAdsClient;
  audit?: AuditLogger;
}

export function createServer(options: CreateServerOptions): McpServer {
  const { config } = options;
  const client =
    options.client ??
    new TelegramAdsClient({
      token: config.token,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });

  const context = {
    client,
    config,
    policy: new Policy(config),
    audit: options.audit ?? new AuditLogger(config.auditLog),
  };

  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  registerTools(server, context);
  registerResources(server);
  registerPrompts(server);

  return server;
}
