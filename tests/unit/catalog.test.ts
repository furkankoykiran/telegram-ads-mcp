import { describe, expect, it } from "vitest";
import { API_METHODS, getMethod, isWriteMethod } from "../../src/api/catalog.js";

describe("method catalog", () => {
  it("contains every official method", () => {
    expect(API_METHODS).toHaveLength(45);
    expect(new Set(API_METHODS.map((method) => method.name)).size).toBe(45);
  });

  it("classifies reads and writes", () => {
    expect(isWriteMethod("getAdsList")).toBe(false);
    expect(isWriteMethod("getAccountStats")).toBe(false);
    expect(isWriteMethod("createAd")).toBe(true);
    expect(isWriteMethod("increaseAdBudget")).toBe(true);
    expect(isWriteMethod("deleteAudience")).toBe(true);
  });

  it("keeps critical createAd parameters", () => {
    const createAd = getMethod("createAd");
    expect(createAd).toBeDefined();
    const names = createAd?.params.map((param) => param.name) ?? [];
    for (const required of ["title", "promote_url", "cpm", "placement", "target"]) {
      expect(names).toContain(required);
    }
    expect(createAd?.returns).toBe("Ad");
  });

  it("marks deprecated methods", () => {
    expect(getMethod("editAdStatus")?.deprecated).toBe(true);
    expect(getMethod("submitAdForReview")?.deprecated).toBe(false);
  });
});
