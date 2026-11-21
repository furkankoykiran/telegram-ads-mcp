import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "../../src/server.js";
import { TelegramAdsClient } from "../../src/api/client.js";
import { loadConfig } from "../../src/config.js";

function fakeFetch(): typeof globalThis.fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/getRelatedAccountsList")) {
      return new Response(JSON.stringify({ ok: false, error: "MAIN_ACCOUNT_REQUIRED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const result = url.endsWith("/getCurrentAccount")
      ? { account_id: "123", title: "Test", currency: "EUR", remaining_budget: 50 }
      : { total_count: 0, ads: [] };
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.find((item) => item.type === "text")?.text ?? "";
}

describe("MCP server contract", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const config = loadConfig({ TELEGRAM_ADS_TOKEN: "test-token" });
    server = createServer({
      config,
      client: new TelegramAdsClient({ token: "test-token", fetch: fakeFetch() }),
    });
    client = new Client({ name: "contract-test", version: "1.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it("publishes the expected tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("tg_get_account");
    expect(names).toContain("tg_list_ads");
    expect(names).toContain("tg_create_ad");
    expect(names).toContain("tg_get_stats");
    expect(names).toContain("tg_search");
    expect(names).toContain("tg_execute");
    expect(names).toContain("tg_api_call");
    expect(names).not.toContain("editAdStatus");
  });

  it("reads the account through a tool", async () => {
    const result = await client.callTool({ name: "tg_get_account", arguments: {} });
    const payload = JSON.parse(textOf(result)) as { account: { account_id: string } };
    expect(payload.account.account_id).toBe("123");
  });

  it("degrades gracefully when related accounts are unavailable", async () => {
    const result = await client.callTool({
      name: "tg_get_account",
      arguments: { include_related: true },
    });
    const payload = JSON.parse(textOf(result)) as {
      account: { account_id: string };
      related: unknown;
      note: string;
    };
    expect(payload.account.account_id).toBe("123");
    expect(payload.related).toBeNull();
    expect(payload.note).toMatch(/main \(agency\) accounts/i);
  });

  it("blocks writes in the default read-only mode", async () => {
    const result = await client.callTool({
      name: "tg_create_ad",
      arguments: {
        title: "Test",
        text: "Hello",
        promote_url: "https://example.com",
        cpm: 1,
        placement: "channel_post",
        target: { type: "channels", channel_ids: ["@example"] },
        confirm: true,
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/WRITE_DISABLED|TG_ADS_MODE=write/);
  });

  it("exposes the usage guide resource", async () => {
    const result = await client.readResource({ uri: "telegram-ads://guide" });
    const text = result.contents[0] && "text" in result.contents[0] ? result.contents[0].text : "";
    expect(text).toContain("Currency precision");
  });

  it("renders the launch-ad prompt", async () => {
    const result = await client.getPrompt({
      name: "launch-ad",
      arguments: { brief: "Promote a developer newsletter to German developers." },
    });
    const text = result.messages[0]?.content;
    expect(JSON.stringify(text)).toContain("tg_create_ad");
  });
});
