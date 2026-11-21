/** Error types surfaced by the server. */

export class TelegramAdsError extends Error {
  readonly code: string;
  readonly httpStatus: number | undefined;
  readonly method: string | undefined;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(options: {
    message: string;
    code: string;
    httpStatus?: number;
    method?: string;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "TelegramAdsError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.method = options.method;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class PolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
  }
}

/** Human-readable hint appended to tool errors for common failure modes. */
export function hintFor(error: unknown): string | undefined {
  if (error instanceof PolicyError) return undefined;
  if (!(error instanceof TelegramAdsError)) return undefined;

  if (error.code === "UNAUTHORIZED" || error.httpStatus === 401) {
    return "The access token was rejected. Create a new token at https://ads.telegram.org/account/api and update TELEGRAM_ADS_TOKEN.";
  }
  if (error.code === "CHANNEL_ID_UNKNOWN") {
    return "Pass the channel as @username so this account can resolve it first, then retry with the numeric ID if needed.";
  }
  if (error.code === "BOT_ID_UNKNOWN") {
    return "Pass the bot as @username so this account can resolve it first, then retry with the numeric ID if needed.";
  }
  if (error.code === "MAIN_ACCOUNT_REQUIRED") {
    return "This method is only available to main (agency) accounts. Use a token from the main account.";
  }
  if (error.code === "IDEMPOTENT_PARAM_MISMATCH") {
    return "This idempotency key was already used with different parameters. Retry with a new key.";
  }
  if (error.code === "IDEMPOTENT_REQUEST_IN_PROGRESS") {
    return "An identical request is still in progress. Wait a moment, then retry with the same key.";
  }
  if (error.httpStatus === 429) {
    return "Telegram Ads is rate limiting this account. Wait before retrying.";
  }
  return undefined;
}
