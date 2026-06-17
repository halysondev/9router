import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { PROVIDER_MODELS, getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

const idsFor = (alias) => (PROVIDER_MODELS[alias] || []).map((m) => m.id);

describe("GLM-5.2 model registration", () => {
  it("adds GLM-5.2 variants to built-in GLM providers", () => {
    expect(idsFor("glm")).toEqual(expect.arrayContaining(["glm-5.2"]));
    expect(idsFor("glm-cn")).toContain("glm-5.2");
  });

  it("registers Z.AI Coding as an OpenAI-compatible provider", () => {
    expect(PROVIDERS["zai-coding"]).toMatchObject({
      baseUrl: "https://api.z.ai/api/coding/paas/v4/chat/completions",
      format: "openai",
    });
    expect(idsFor("zai-coding")).toContain("glm-5.2");
    expect(getModelsByProviderId("zai-coding").some((m) => m.id === "glm-5.2")).toBe(true);
  });

  it("sets GLM-5.2 capability limits to 1M context and 128K output", () => {
    for (const model of ["glm-5.2"]) {
      expect(getCapabilitiesForModel("glm", model)).toMatchObject({
        reasoning: true,
        thinkingFormat: "zai",
        contextWindow: 1000000,
        maxOutput: 131072,
      });
    }
  });
});

describe("GLM Coding tool streaming", () => {
  const body = () => ({
    stream: true,
    messages: [{ role: "user", content: "use the tool" }],
    tools: [{
      type: "function",
      function: {
        name: "calculator",
        parameters: { type: "object", properties: {} },
      },
    }],
  });

  it("auto-enables tool_stream for OpenAI-compatible GLM coding providers", () => {
    for (const provider of ["zai-coding", "glm-cn"]) {
      const transformed = new DefaultExecutor(provider).transformRequest("glm-5.2", body());
      expect(transformed.tool_stream, provider).toBe(true);
    }
  });

  it("does not auto-enable tool_stream for Claude-compatible glm", () => {
    const transformed = new DefaultExecutor("glm").transformRequest("glm-5.2", body());
    expect(transformed.tool_stream).toBeUndefined();
  });

  it("preserves explicit tool_stream false", () => {
    const input = { ...body(), tool_stream: false };
    const transformed = new DefaultExecutor("zai-coding").transformRequest("glm-5.2", input);
    expect(transformed.tool_stream).toBe(false);
  });
});
