import type { Config } from "./config.js";
import type { Currency } from "./api/types.js";
import { PolicyError } from "./errors.js";
import { assertMoney } from "./money.js";

const WRITE_HINT =
  "Write access is disabled. Set TG_ADS_MODE=write in the server environment and restart the server.";

/**
 * Central guard for anything that can spend money or change account state.
 * Every write tool must pass through here before touching the API.
 */
export class Policy {
  constructor(private readonly config: Config) {}

  get canWrite(): boolean {
    return this.config.mode === "write";
  }

  get codeModeEnabled(): boolean {
    return this.config.codeMode !== "off";
  }

  get codeModeCanWrite(): boolean {
    return this.config.codeMode === "write";
  }

  assertWrite(confirm: boolean | undefined): void {
    if (!this.canWrite) throw new PolicyError("WRITE_DISABLED", WRITE_HINT);
    if (confirm !== true) {
      throw new PolicyError(
        "CONFIRMATION_REQUIRED",
        "This operation changes the account. Re-run with confirm: true after verifying the parameters. " +
          "Use dry_run: true to validate without calling the API.",
      );
    }
  }

  assertCodeModeWrite(confirm: boolean | undefined): void {
    if (!this.canWrite) throw new PolicyError("WRITE_DISABLED", WRITE_HINT);
    if (!this.codeModeCanWrite) {
      throw new PolicyError(
        "CODE_MODE_WRITE_DISABLED",
        "Code Mode can only read. Set TG_ADS_CODE_MODE=write to allow write methods inside tg_execute.",
      );
    }
    if (confirm !== true) {
      throw new PolicyError(
        "CONFIRMATION_REQUIRED",
        "Code Mode may change the account. Re-run tg_execute with confirm: true.",
      );
    }
  }

  assertAccount(accountId: string | undefined): void {
    if (!accountId || this.config.allowedAccounts.length === 0) return;
    if (!this.config.allowedAccounts.includes(accountId)) {
      throw new PolicyError(
        "ACCOUNT_NOT_ALLOWED",
        `Account ${accountId} is not in TG_ADS_ALLOWED_ACCOUNTS.`,
      );
    }
  }

  assertCpm(cpm: number, currency: Currency): void {
    assertMoney(cpm, currency, "budget", "cpm");
    if (this.config.maxCpm !== undefined && cpm > this.config.maxCpm) {
      throw new PolicyError(
        "CPM_LIMIT_EXCEEDED",
        `cpm ${cpm} exceeds TG_ADS_MAX_CPM (${this.config.maxCpm}).`,
      );
    }
  }

  assertAdBudget(amount: number, currency: Currency, field = "initial_budget"): void {
    assertMoney(amount, currency, "budget", field);
    if (this.config.maxAdBudget !== undefined && amount > this.config.maxAdBudget) {
      throw new PolicyError(
        "BUDGET_LIMIT_EXCEEDED",
        `${field} ${amount} exceeds TG_ADS_MAX_AD_BUDGET (${this.config.maxAdBudget}).`,
      );
    }
  }

  assertDailyBudget(amount: number, currency: Currency): void {
    assertMoney(amount, currency, "budget", "daily_budget_limit");
    if (this.config.maxDailyBudget !== undefined && amount > this.config.maxDailyBudget) {
      throw new PolicyError(
        "DAILY_BUDGET_LIMIT_EXCEEDED",
        `daily_budget_limit ${amount} exceeds TG_ADS_MAX_DAILY_BUDGET (${this.config.maxDailyBudget}).`,
      );
    }
  }

  assertAmount(amount: number, currency: Currency): void {
    assertMoney(amount, currency, "amount", "amount");
    if (this.config.maxAdBudget !== undefined && amount > this.config.maxAdBudget) {
      throw new PolicyError(
        "BUDGET_LIMIT_EXCEEDED",
        `amount ${amount} exceeds TG_ADS_MAX_AD_BUDGET (${this.config.maxAdBudget}).`,
      );
    }
  }
}
