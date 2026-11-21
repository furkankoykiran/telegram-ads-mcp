import { z } from "zod";
import { ConfigError } from "./errors.js";
import { DEFAULT_BASE_URL } from "./api/client.js";

const optionalNumber = z.preprocess(
  (value) => (value === undefined || value === "" ? undefined : Number(value)),
  z.number().finite().nonnegative().optional(),
);

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const schema = z.object({
  token: z.string().min(1, "TELEGRAM_ADS_TOKEN is required."),
  mode: z.enum(["read-only", "write"]).default("read-only"),
  codeMode: z.enum(["off", "read-only", "write"]).default("read-only"),
  allowedAccounts: z.array(z.string()).default([]),
  maxCpm: optionalNumber,
  maxAdBudget: optionalNumber,
  maxDailyBudget: optionalNumber,
  auditLog: optionalString,
  timeoutMs: z.number().int().positive().default(30_000),
  baseUrl: z.string().url().default(DEFAULT_BASE_URL),
});

export type Config = z.infer<typeof schema>;

export interface LoadConfigOptions {
  /** Allow commands such as `init` and `--help` to run without a token. */
  requireToken?: boolean;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): Config {
  const raw = {
    token:
      env.TELEGRAM_ADS_TOKEN ?? env.TG_ADS_TOKEN ?? (options.requireToken === false ? "-" : ""),
    mode: env.TG_ADS_MODE,
    codeMode: env.TG_ADS_CODE_MODE,
    allowedAccounts: (env.TG_ADS_ALLOWED_ACCOUNTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    maxCpm: env.TG_ADS_MAX_CPM,
    maxAdBudget: env.TG_ADS_MAX_AD_BUDGET,
    maxDailyBudget: env.TG_ADS_MAX_DAILY_BUDGET,
    auditLog: env.TG_ADS_AUDIT_LOG,
    timeoutMs: env.TG_ADS_TIMEOUT_MS ? Number(env.TG_ADS_TIMEOUT_MS) : 30_000,
    baseUrl: env.TG_ADS_BASE_URL ?? DEFAULT_BASE_URL,
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigError(`Invalid configuration:\n- ${issues.join("\n- ")}`);
  }
  return parsed.data;
}
