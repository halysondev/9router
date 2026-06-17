import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  loadState: vi.fn(),
  saveState: vi.fn(),
  generateShortId: vi.fn(),
  spawnQuickTunnel: vi.fn(),
  killCloudflared: vi.fn(),
  isCloudflaredRunning: vi.fn(),
  setUnexpectedExitHandler: vi.fn(),
  clearPid: vi.fn(),
  waitForHealth: vi.fn(),
  probeUrlAlive: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("../../src/lib/tunnel/shared/state.js", () => ({
  loadState: mocks.loadState,
  saveState: mocks.saveState,
  generateShortId: mocks.generateShortId,
}));

vi.mock("../../src/lib/tunnel/cloudflare/cloudflared.js", () => ({
  spawnQuickTunnel: mocks.spawnQuickTunnel,
  killCloudflared: mocks.killCloudflared,
  isCloudflaredRunning: mocks.isCloudflaredRunning,
  setUnexpectedExitHandler: mocks.setUnexpectedExitHandler,
}));

vi.mock("../../src/lib/tunnel/cloudflare/pid.js", () => ({
  clearPid: mocks.clearPid,
}));

vi.mock("../../src/lib/tunnel/cloudflare/healthCheck.js", () => ({
  waitForHealth: mocks.waitForHealth,
  probeUrlAlive: mocks.probeUrlAlive,
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}));

const originalFetch = global.fetch;
const { enableTunnel } = await import("../../src/lib/tunnel/cloudflare/manager.js");

describe("cloudflare tunnel manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadState.mockReturnValue(null);
    mocks.generateShortId.mockReturnValue("ld4jca");
    mocks.isCloudflaredRunning.mockReturnValue(false);
    mocks.spawnQuickTunnel.mockResolvedValue({
      tunnelUrl: "https://capture-regional-retreat-adipex.trycloudflare.com",
    });
    mocks.waitForHealth.mockResolvedValue(true);
    mocks.probeUrlAlive.mockResolvedValue(false);
    mocks.updateSettings.mockResolvedValue();
    global.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns success when the public health check times out after registration", async () => {
    mocks.waitForHealth.mockRejectedValue(new Error("Health check timeout after 60000ms"));

    const result = await enableTunnel();

    expect(result).toMatchObject({
      success: true,
      tunnelUrl: "https://capture-regional-retreat-adipex.trycloudflare.com",
      shortId: "ld4jca",
      publicUrl: "https://rld4jca.abc-tunnel.us",
      reachable: false,
    });
    expect(mocks.saveState).toHaveBeenCalledWith({
      shortId: "ld4jca",
      tunnelUrl: "https://capture-regional-retreat-adipex.trycloudflare.com",
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      tunnelEnabled: true,
      tunnelUrl: "https://capture-regional-retreat-adipex.trycloudflare.com",
    });
  });
});
