import { describe, expect, it } from "vitest";
import { TelegramAdsClient } from "../../src/api/client.js";
import { TelegramAdsError } from "../../src/errors.js";

interface Recorded {
  url: string;
  init: RequestInit;
}

function fakeFetch(responses: Array<Response | (() => Response)>): {
  fetch: typeof globalThis.fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("No fake response left.");
    return typeof next === "function" ? next() : next;
  };
  return { fetch: fetchImpl as typeof globalThis.fetch, calls };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("TelegramAdsClient", () => {
  it("authenticates and unwraps result", async () => {
    const fake = fakeFetch([json({ ok: true, result: { account_id: "42", currency: "EUR" } })]);
    const client = new TelegramAdsClient({ token: "secret-token", fetch: fake.fetch });

    const account = await client.call<{ account_id: string }>("getCurrentAccount");

    expect(account.account_id).toBe("42");
    expect(fake.calls[0]?.url).toBe("https://promoteapi.telegram.org/getCurrentAccount");
    const headers = fake.calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("normalises Telegram errors", async () => {
    const fake = fakeFetch([
      json({ ok: false, error: "AD_TITLE_REQUIRED", description: "Title is missing." }, 400),
    ]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch });

    await expect(client.call("getAdsList")).rejects.toMatchObject({
      name: "TelegramAdsError",
      code: "AD_TITLE_REQUIRED",
      httpStatus: 400,
    });
  });

  it("maps 401 responses to UNAUTHORIZED", async () => {
    const fake = fakeFetch([json({ ok: false }, 401)]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch });

    await expect(client.call("getCurrentAccount")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("retries 429 and reuses the idempotency key", async () => {
    const fake = fakeFetch([
      json({ ok: false, error: "FLOOD" }, 429, { "retry-after": "0" }),
      json({ ok: true, result: { ad_id: 7 } }),
    ]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch, maxRetries: 1 });

    const result = await client.write("createAd", { title: "x" });

    expect(result.data).toEqual({ ad_id: 7 });
    expect(result.attempts).toBe(2);
    expect(fake.calls).toHaveLength(2);
    const first = fake.calls[0]?.init.headers as Record<string, string>;
    const second = fake.calls[1]?.init.headers as Record<string, string>;
    expect(first["Idempotency-Key"]).toBeDefined();
    expect(first["Idempotency-Key"]).toBe(second["Idempotency-Key"]);
  });

  it("refuses write methods through the read-only call path", async () => {
    const fake = fakeFetch([]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch });

    await expect(client.call("createAd", {})).rejects.toThrow(/idempotency key/);
    expect(fake.calls).toHaveLength(0);
  });

  it("wraps network failures", async () => {
    const fake = fakeFetch([
      () => {
        throw new Error("socket hang up");
      },
    ]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch, maxRetries: 0 });

    await expect(client.call("getCurrentAccount")).rejects.toBeInstanceOf(TelegramAdsError);
  });

  it("caches account currency lookups", async () => {
    const fake = fakeFetch([json({ ok: true, result: { account_id: "1", currency: "XTR" } })]);
    const client = new TelegramAdsClient({ token: "t", fetch: fake.fetch });

    expect(await client.resolveCurrency()).toBe("XTR");
    expect(await client.resolveCurrency()).toBe("XTR");
    expect(fake.calls).toHaveLength(1);
  });
});
