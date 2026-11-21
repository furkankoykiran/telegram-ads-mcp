import { describe, expect, it } from "vitest";
import { buildSdkDts, searchMethods } from "../../src/code-mode/sdk.js";

describe("Code Mode SDK", () => {
  it("lists every non-deprecated method in the declarations", () => {
    const sdk = buildSdkDts();
    expect(sdk).toContain("getAdsList(params?");
    expect(sdk).toContain("createAd(params");
    expect(sdk).not.toContain("editAdStatus");
  });

  it("searches by name", () => {
    const matches = searchMethods("getAdsList", 5);
    expect(matches[0]?.name).toBe("getAdsList");
    expect(matches[0]?.write).toBe(false);
  });

  it("filters by write flag before applying the limit", () => {
    const matches = searchMethods("", 50, true);
    expect(matches.length).toBeGreaterThan(10);
    expect(matches.every((method) => method.write)).toBe(true);
    expect(matches.some((method) => method.name === "createAd")).toBe(true);
  });

  it("returns no matches for an unknown query", () => {
    expect(searchMethods("definitelyNotAMethod", 10)).toEqual([]);
  });
});
