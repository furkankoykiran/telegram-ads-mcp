import { describe, expect, it } from "vitest";
import { hintFor, TelegramAdsError } from "../../src/errors.js";

describe("hintFor", () => {
  it("explains that some methods require a main account", () => {
    const error = new TelegramAdsError({
      message: "MAIN_ACCOUNT_REQUIRED",
      code: "MAIN_ACCOUNT_REQUIRED",
    });

    expect(hintFor(error)).toMatch(/main \(agency\) accounts/i);
  });
});
