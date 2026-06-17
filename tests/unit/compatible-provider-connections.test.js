import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

async function setupTestContext(nodeData) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-compatible-provider-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  vi.doMock("next/server", () => ({
    NextResponse: {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status || 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  }));

  const { POST } = await import("@/app/api/providers/route.js");
  const {
    createProviderNode,
    getProviderConnections,
  } = await import("@/models/index.js");

  const node = await createProviderNode(nodeData);

  return {
    node,
    POST,
    getProviderConnections,
    cleanup() {
      try { global._dbAdapter?.instance?.close?.(); } catch {}
      delete global._dbAdapter;
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    },
  };
}

function makeRequest(provider, overrides = {}) {
  return new Request("https://9router.local/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: "test-key",
      name: "Test Connection",
      defaultModel: "test-model",
      ...overrides,
    }),
  });
}

function expectCompatibleConnection(connection, node, { apiType } = {}) {
  expect(connection.provider).toBe(node.id);
  expect(connection.authType).toBe("apikey");
  expect(connection.defaultModel).toBe("test-model");
  expect(connection.providerSpecificData).toMatchObject({
    prefix: node.prefix,
    baseUrl: node.baseUrl,
    nodeName: node.name,
  });

  if (apiType !== undefined) {
    expect(connection.providerSpecificData.apiType).toBe(apiType);
  }
}

describe("compatible provider connections API", () => {
  let cleanup = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("next/server");
    vi.resetModules();
    vi.clearAllMocks();
    cleanup();
    cleanup = () => {};
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("creates one API-key connection for an OpenAI-compatible node", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-test",
      type: "openai-compatible",
      name: "OpenAI Compatible Test Node",
      prefix: "oct",
      apiType: "chat",
      baseUrl: "https://openai-compatible.test/v1",
    });
    cleanup = ctx.cleanup;

    const response = await ctx.POST(makeRequest(ctx.node.id));
    const body = await response.json();
    const connection = body.connection;
    const storedConnections = await ctx.getProviderConnections({ provider: ctx.node.id });

    expect(response.status).toBe(201);
    expect(storedConnections).toHaveLength(1);
    expectCompatibleConnection(connection, ctx.node, { apiType: "chat" });
    expect(storedConnections[0]).toMatchObject({
      provider: ctx.node.id,
      authType: "apikey",
      defaultModel: "test-model",
      providerSpecificData: {
        prefix: ctx.node.prefix,
        apiType: "chat",
        baseUrl: ctx.node.baseUrl,
        nodeName: ctx.node.name,
      },
    });
  });

  it("creates one API-key connection for an Anthropic-compatible node", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-test",
      type: "anthropic-compatible",
      name: "Anthropic Compatible Test Node",
      prefix: "act",
      baseUrl: "https://anthropic-compatible.test/v1",
    });
    cleanup = ctx.cleanup;

    const response = await ctx.POST(makeRequest(ctx.node.id));
    const body = await response.json();
    const connection = body.connection;
    const storedConnections = await ctx.getProviderConnections({ provider: ctx.node.id });

    expect(response.status).toBe(201);
    expect(storedConnections).toHaveLength(1);
    expectCompatibleConnection(connection, ctx.node);
    expect(storedConnections[0]).toMatchObject({
      provider: ctx.node.id,
      authType: "apikey",
      defaultModel: "test-model",
      providerSpecificData: {
        prefix: ctx.node.prefix,
        baseUrl: ctx.node.baseUrl,
        nodeName: ctx.node.name,
      },
    });
  });

  it("creates multiple API-key connections for the same OpenAI-compatible node", async () => {
    const ctx = await setupTestContext({
      id: "openai-compatible-multi-test",
      type: "openai-compatible",
      name: "Multi OpenAI Compatible Node",
      prefix: "multi",
      apiType: "chat",
      baseUrl: "https://multi-openai-compatible.test/v1",
    });
    cleanup = ctx.cleanup;

    const firstResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Primary Key", apiKey: "test-key-1" }));
    const secondResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Fallback Key", apiKey: "test-key-2" }));
    const storedConnections = await ctx.getProviderConnections({ provider: ctx.node.id });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(storedConnections).toHaveLength(2);
    expect(storedConnections.map((connection) => connection.name).sort()).toEqual(["Fallback Key", "Primary Key"]);
    for (const connection of storedConnections) {
      expectCompatibleConnection(connection, ctx.node, { apiType: "chat" });
    }
  });

  it("creates multiple API-key connections for the same Anthropic-compatible node", async () => {
    const ctx = await setupTestContext({
      id: "anthropic-compatible-multi-test",
      type: "anthropic-compatible",
      name: "Multi Anthropic Compatible Node",
      prefix: "anthmulti",
      baseUrl: "https://multi-anthropic-compatible.test/v1",
    });
    cleanup = ctx.cleanup;

    const firstResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Primary Anthropic Key", apiKey: "test-key-1" }));
    const secondResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Fallback Anthropic Key", apiKey: "test-key-2" }));
    const storedConnections = await ctx.getProviderConnections({ provider: ctx.node.id });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(storedConnections).toHaveLength(2);
    expect(storedConnections.map((connection) => connection.name).sort()).toEqual(["Fallback Anthropic Key", "Primary Anthropic Key"]);
    for (const connection of storedConnections) {
      expectCompatibleConnection(connection, ctx.node);
    }
  });

  it("creates multiple API-key connections for the same custom embedding node", async () => {
    const ctx = await setupTestContext({
      id: "custom-embedding-multi-test",
      type: "custom-embedding",
      name: "Multi Custom Embedding Node",
      prefix: "embmulti",
      baseUrl: "https://multi-custom-embedding.test/v1",
    });
    cleanup = ctx.cleanup;

    const firstResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Primary Embedding Key", apiKey: "test-key-1" }));
    const secondResponse = await ctx.POST(makeRequest(ctx.node.id, { name: "Fallback Embedding Key", apiKey: "test-key-2" }));
    const storedConnections = await ctx.getProviderConnections({ provider: ctx.node.id });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(storedConnections).toHaveLength(2);
    expect(storedConnections.map((connection) => connection.name).sort()).toEqual(["Fallback Embedding Key", "Primary Embedding Key"]);
    for (const connection of storedConnections) {
      expectCompatibleConnection(connection, ctx.node);
    }
  });
});
