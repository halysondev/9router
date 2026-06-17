import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("chat handler credentials errors", () => {
  beforeEach(() => {
    vi.resetModules();

    vi.doMock("@/lib/localDb", () => ({
      getSettings: vi.fn(async () => ({ requireApiKey: false })),
    }));

    vi.doMock("@/sse/services/auth.js", () => ({
      getProviderCredentials: vi.fn(async () => null),
      markAccountUnavailable: vi.fn(),
      clearAccountError: vi.fn(),
      extractApiKey: vi.fn(() => null),
      isValidApiKey: vi.fn(async () => true),
    }));

    vi.doMock("@/sse/services/model.js", () => ({
      getModelInfo: vi.fn(async () => ({ provider: "missing-provider", model: "missing-model" })),
      getComboModels: vi.fn(async () => null),
    }));

    vi.doMock("@/sse/services/tokenRefresh.js", () => ({
      updateProviderCredentials: vi.fn(),
      checkAndRefreshToken: vi.fn(async (_provider, credentials) => credentials),
    }));

    vi.doMock("open-sse/handlers/chatCore.js", () => ({
      handleChatCore: vi.fn(),
    }));

    vi.doMock("open-sse/services/combo.js", () => ({
      handleComboChat: vi.fn(),
    }));

    vi.doMock("open-sse/utils/bypassHandler.js", () => ({
      handleBypassRequest: vi.fn(() => null),
    }));

    vi.doMock("open-sse/utils/claudeHeaderCache.js", () => ({
      cacheClaudeHeaders: vi.fn(),
    }));

    vi.doMock("open-sse/services/projectId.js", () => ({
      getProjectIdForConnection: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns service unavailable when the resolved provider has no active credentials", async () => {
    const { handleChat } = await import("@/sse/handlers/chat.js");
    const response = await handleChat(new Request("https://9router.local/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "missing-provider/missing-model",
        messages: [{ role: "user", content: "hello" }],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toBe("No active credentials for provider: missing-provider");
  });
});
