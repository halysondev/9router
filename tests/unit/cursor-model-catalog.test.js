import fs from "node:fs";

import { describe, expect, it } from "vitest";
import { PROVIDER_MODELS, getModelsByProviderId } from "../../open-sse/config/providerModels.js";

const cursorRef = JSON.parse(
  fs.readFileSync(new URL("../../ref/cursor-models-2.json", import.meta.url), "utf8"),
);

const catalogIds = () => (PROVIDER_MODELS.cu || []).map((model) => model.id);

describe("Cursor model catalog", () => {
  it("includes every base model captured from the Cursor IDE picker", () => {
    const refBaseIds = cursorRef.items.map((item) => item.id);

    expect(catalogIds()).toEqual(expect.arrayContaining(refBaseIds));
  });

  it("exposes the curated Cursor Opus and Composer variants", () => {
    const expected = [
      "composer-2.5",
      "composer-2.5-fast",

      "claude-opus-4-8-high",
      "claude-opus-4-8-thinking-high",
      "claude-opus-4-8-high-fast",
      "claude-opus-4-8-thinking-high-fast",
      "claude-opus-4-8-xhigh",
      "claude-opus-4-8-thinking-xhigh",
      "claude-opus-4-8-xhigh-fast",
      "claude-opus-4-8-thinking-xhigh-fast",

      "claude-opus-4-7-high",
      "claude-opus-4-7-thinking-high",
      "claude-opus-4-7-high-fast",
      "claude-opus-4-7-thinking-high-fast",
      "claude-opus-4-7-xhigh",
      "claude-opus-4-7-thinking-xhigh",
      "claude-opus-4-7-xhigh-fast",
      "claude-opus-4-7-thinking-xhigh-fast",

      "claude-opus-4-6-high",
      "claude-opus-4-6-thinking-high",
      "claude-opus-4-6-high-fast",
      "claude-opus-4-6-thinking-high-fast",
    ];

    expect(catalogIds()).toEqual(expect.arrayContaining(expected));
  });

  it("keeps the fork restriction against Cursor Opus 4.6 max variants", () => {
    expect(catalogIds()).not.toEqual(
      expect.arrayContaining([
        "claude-opus-4-6-max",
        "claude-opus-4-6-thinking-max",
        "claude-opus-4-6-max-fast",
        "claude-opus-4-6-thinking-max-fast",
      ]),
    );
  });

  it("is exposed through provider-id lookup used by the dashboard", () => {
    const ids = getModelsByProviderId("cursor").map((model) => model.id);

    expect(ids).toContain("composer-2.5-fast");
    expect(ids).toContain("claude-opus-4-8-thinking-xhigh-fast");
  });
});
