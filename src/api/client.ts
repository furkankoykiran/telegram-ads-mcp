import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Account, Currency } from "./types.js";
import { getMethod } from "./catalog.js";
import { TelegramAdsError } from "../errors.js";
import { VERSION } from "../version.js";

export const DEFAULT_BASE_URL = "https://promoteapi.telegram.org";
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export type Params = Record<string, unknown>;

export interface TelegramAdsClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxConcurrent?: number;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}

export interface CallOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface WriteResult<T> {
  data: T;
  idempotencyKey: string;
  attempts: number;
}

export interface UploadFile {
  path: string;
  contentType?: string;
}

interface RawResponse<T> {
  data: T;
  attempts: number;
}

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active += 1;
    }

    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoff(attempt: number): number {
  const ceiling = Math.min(500 * 2 ** attempt, 8_000);
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Thin, dependency-free client for https://promoteapi.telegram.org.
 *
 * Responsibilities kept deliberately small: authentication, JSON/multipart
 * encoding, retries with jitter, idempotency keys and error normalisation.
 */
export class TelegramAdsClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly userAgent: string;
  private readonly semaphore: Semaphore;
  private readonly accountCache = new Map<string, { account: Account; expires: number }>();

  constructor(options: TelegramAdsClientOptions) {
    if (!options.token) throw new Error("A Telegram Ads access token is required.");
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? `telegram-ads-mcp/${VERSION}`;
    this.semaphore = new Semaphore(options.maxConcurrent ?? 4);
  }

  /** Read-only call. Write methods are rejected so callers cannot bypass policy by accident. */
  async call<T>(method: string, params: Params = {}, options: CallOptions = {}): Promise<T> {
    if (getMethod(method)?.write) {
      throw new Error(`${method} changes state. Use write() so an idempotency key is attached.`);
    }
    const response = await this.request<T>(method, params, options);
    return response.data;
  }

  /** Write call. Always carries an idempotency key, including across retries. */
  async write<T>(
    method: string,
    params: Params = {},
    options: CallOptions = {},
  ): Promise<WriteResult<T>> {
    const idempotencyKey = options.idempotencyKey ?? randomUUID();
    const response = await this.request<T>(method, params, { ...options, idempotencyKey });
    return { data: response.data, idempotencyKey, attempts: response.attempts };
  }

  /** Multipart upload for uploadAdPhoto, uploadAdVideo and uploadWebsitePhoto. */
  async upload<T>(
    method: string,
    params: Params,
    file: UploadFile,
    options: CallOptions = {},
  ): Promise<WriteResult<T>> {
    const idempotencyKey = options.idempotencyKey ?? randomUUID();
    const buffer = await readFile(file.path);
    const contentType =
      file.contentType ??
      MIME_BY_EXTENSION[extname(file.path).toLowerCase()] ??
      "application/octet-stream";

    const form = new FormData();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    form.append("file", new Blob([buffer], { type: contentType }), basename(file.path));

    const response = await this.request<T>(method, form, { ...options, idempotencyKey }, true);
    return { data: response.data, idempotencyKey, attempts: response.attempts };
  }

  async getCurrentAccount(): Promise<Account> {
    return this.resolveAccount();
  }

  async resolveAccount(accountId?: string): Promise<Account> {
    const key = accountId ?? "__current__";
    const cached = this.accountCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.account;

    const account = accountId
      ? await this.call<Account[]>("getAccountsById", { account_ids: [accountId] }).then(
          (accounts) => {
            const first = accounts[0];
            if (!first) {
              throw new TelegramAdsError({
                code: "ACCOUNT_NOT_FOUND",
                message: `Account ${accountId} was not returned by the API.`,
              });
            }
            return first;
          },
        )
      : await this.call<Account>("getCurrentAccount");

    this.accountCache.set(key, { account, expires: Date.now() + 60_000 });
    return account;
  }

  async resolveCurrency(accountId?: string): Promise<Currency> {
    return (await this.resolveAccount(accountId)).currency;
  }

  clearCache(): void {
    this.accountCache.clear();
  }

  private async request<T>(
    method: string,
    params: Params | FormData,
    options: CallOptions,
    multipart = false,
  ): Promise<RawResponse<T>> {
    const url = `${this.baseUrl}/${method}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (!multipart) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    const body = multipart ? (params as FormData) : JSON.stringify(params);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await this.semaphore.run(() =>
          this.fetchImpl(url, { method: "POST", headers, body, signal: controller.signal }),
        );

        if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
          const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
          await response.body?.cancel().catch(() => undefined);
          await sleep(retryAfter ?? backoff(attempt));
          continue;
        }

        const payload = await this.parseBody(response);
        if (!response.ok) {
          throw this.toError(method, response.status, payload);
        }
        if (isRecord(payload) && payload.ok === false) {
          throw this.toError(method, response.status, payload);
        }
        const data =
          isRecord(payload) && "result" in payload ? (payload.result as T) : (payload as T);
        return { data, attempts: attempt + 1 };
      } catch (error) {
        if (error instanceof TelegramAdsError) throw error;

        const aborted = error instanceof Error && error.name === "AbortError";
        if (timedOut) {
          lastError = new TelegramAdsError({
            code: "REQUEST_TIMEOUT",
            message: `Request to ${method} timed out after ${this.timeoutMs} ms.`,
            method,
            retryable: true,
          });
        } else if (aborted) {
          throw new TelegramAdsError({
            code: "REQUEST_ABORTED",
            message: `Request to ${method} was aborted.`,
            method,
            retryable: false,
          });
        } else {
          lastError = new TelegramAdsError({
            code: "NETWORK_ERROR",
            message:
              error instanceof Error ? error.message : `Network error while calling ${method}.`,
            method,
            retryable: true,
            details: error,
          });
        }

        if (attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new TelegramAdsError({ code: "UNKNOWN", message: `Request to ${method} failed.`, method });
  }

  private async parseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, error: `HTTP_${response.status}`, description: text.slice(0, 500) };
    }
  }

  private toError(method: string, status: number, payload: unknown): TelegramAdsError {
    const record = isRecord(payload) ? payload : {};
    const rawCode = record.error ?? record.error_code;
    const code =
      typeof rawCode === "string" ? rawCode : status === 401 ? "UNAUTHORIZED" : `HTTP_${status}`;
    const description =
      typeof record.description === "string"
        ? record.description
        : typeof record.message === "string"
          ? record.message
          : undefined;

    return new TelegramAdsError({
      code,
      message: description ? `${code}: ${description}` : code,
      httpStatus: status,
      method,
      retryable: RETRYABLE_STATUS.has(status),
      details: record,
    });
  }
}
