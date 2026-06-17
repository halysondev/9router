import { describe, expect, it } from "vitest";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";

describe("account fallback classification", () => {
  it("does not fallback or cooldown on upstream 404 model errors", () => {
    expect(checkFallbackError(404, "model not found", 0)).toEqual({
      shouldFallback: false,
      cooldownMs: 0,
    });
  });
});
