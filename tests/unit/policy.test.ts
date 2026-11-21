import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { PolicyError } from "../../src/errors.js";
import { Policy } from "../../src/policy.js";

const base = { TELEGRAM_ADS_TOKEN: "token" };

describe("Policy", () => {
  it("blocks writes in read-only mode", () => {
    const policy = new Policy(loadConfig({ ...base, TG_ADS_MODE: "read-only" }));
    expect(() => policy.assertWrite(true)).toThrow(PolicyError);
    expect(() => policy.assertWrite(true)).toThrow(/TG_ADS_MODE=write/);
  });

  it("requires explicit confirmation in write mode", () => {
    const policy = new Policy(loadConfig({ ...base, TG_ADS_MODE: "write" }));
    expect(() => policy.assertWrite(undefined)).toThrow(/confirm: true/);
    expect(() => policy.assertWrite(false)).toThrow(/confirm: true/);
    expect(() => policy.assertWrite(true)).not.toThrow();
  });

  it("enforces the account allowlist", () => {
    const policy = new Policy(loadConfig({ ...base, TG_ADS_ALLOWED_ACCOUNTS: "a, b" }));
    expect(() => policy.assertAccount("a")).not.toThrow();
    expect(() => policy.assertAccount("c")).toThrow(/ACCOUNT_NOT_ALLOWED|not in/);
    expect(() => policy.assertAccount(undefined)).not.toThrow();
  });

  it("enforces CPM and budget caps", () => {
    const policy = new Policy(
      loadConfig({
        ...base,
        TG_ADS_MAX_CPM: "2",
        TG_ADS_MAX_AD_BUDGET: "100",
        TG_ADS_MAX_DAILY_BUDGET: "10",
      }),
    );

    expect(() => policy.assertCpm(1.5, "EUR")).not.toThrow();
    expect(() => policy.assertCpm(2.5, "EUR")).toThrow(/CPM_LIMIT_EXCEEDED|exceeds/);
    expect(() => policy.assertAdBudget(50, "EUR")).not.toThrow();
    expect(() => policy.assertAdBudget(150, "EUR")).toThrow(/BUDGET_LIMIT_EXCEEDED|exceeds/);
    expect(() => policy.assertDailyBudget(20, "EUR")).toThrow(
      /DAILY_BUDGET_LIMIT_EXCEEDED|exceeds/,
    );
  });

  it("still enforces currency precision under the caps", () => {
    const policy = new Policy(loadConfig(base));
    expect(() => policy.assertCpm(1.234, "EUR")).toThrow(/decimal/);
  });

  it("gates Code Mode writes separately", () => {
    const readOnly = new Policy(loadConfig({ ...base, TG_ADS_MODE: "write" }));
    expect(() => readOnly.assertCodeModeWrite(true)).toThrow(/Code Mode can only read/);

    const enabled = new Policy(
      loadConfig({ ...base, TG_ADS_MODE: "write", TG_ADS_CODE_MODE: "write" }),
    );
    expect(() => enabled.assertCodeModeWrite(true)).not.toThrow();
    expect(() => enabled.assertCodeModeWrite(false)).toThrow(/confirm: true/);
  });
});
