import { describe, expect, it, vi } from "vitest";
import "./registerAll.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
  saveRequestUsage: vi.fn(() => Promise.resolve()),
  trackPendingRequest: vi.fn(),
}));

const { handleForcedSSEToJson } = await import("../../open-sse/handlers/chatCore/sseToJsonHandler.js");

function runResponsesToOpenAI(events) {
  const state = initState(FORMATS.OPENAI);
  const chunks = [];
  for (const event of events) {
    const out = translateResponse(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, event, state);
    if (Array.isArray(out)) chunks.push(...out.filter(Boolean));
    else if (out) chunks.push(out);
  }
  return chunks;
}

function encodeResponsesSse(events) {
  return events
    .map((event) => [
      `event: ${event.type}`,
      `data: ${JSON.stringify(event)}`,
      "",
    ].join("\n"))
    .join("\n");
}

describe("Cursor IDE → Codex tool calls", () => {
  it("maps custom_tool_call events with custom.name to OpenAI tool_calls", () => {
    const chunks = runResponsesToOpenAI([
      { type: "response.created", response: { id: "resp_custom" } },
      {
        type: "response.output_item.added",
        output_index: 2,
        item: {
          id: "ctc_1",
          type: "custom_tool_call",
          call_id: "call_custom_1",
          custom: { name: "ApplyPatch" },
        },
      },
      {
        type: "response.custom_tool_call_input.delta",
        output_index: 2,
        delta: "{\"patch\":\"*** Begin Patch\"}",
      },
      {
        type: "response.output_item.done",
        output_index: 2,
        item: {
          id: "ctc_1",
          type: "custom_tool_call",
          call_id: "call_custom_1",
          custom: { name: "ApplyPatch" },
          input: { patch: "*** Begin Patch" },
        },
      },
      { type: "response.completed", response: {} },
    ]);

    const toolDeltas = chunks.flatMap((chunk) => chunk.choices?.[0]?.delta?.tool_calls || []);
    expect(toolDeltas[0]).toMatchObject({
      index: 2,
      id: "call_custom_1",
      type: "function",
      function: { name: "ApplyPatch", arguments: "" },
    });
    expect(toolDeltas[1]).toMatchObject({
      index: 2,
      function: { arguments: "{\"patch\":\"*** Begin Patch\"}" },
    });
    expect(chunks.at(-1).choices[0].finish_reason).toBe("tool_calls");
  });

  it("preserves forced tool choice and matched function_call_output for Codex", () => {
    const longCallId = "call_" + "x".repeat(80);
    const translated = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.5",
      {
        messages: [
          { role: "user", content: "apply a patch" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: longCallId,
                type: "function",
                function: { name: "ApplyPatch", arguments: "{\"patch\":\"x\"}" },
              },
            ],
          },
          { role: "tool", tool_call_id: longCallId, content: "patched" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "ApplyPatch",
              description: "Apply a unified patch",
              parameters: { type: "object" },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "ApplyPatch" } },
      },
      true,
      null,
      "codex",
    );

    expect(translated.tools[0]).toMatchObject({
      type: "function",
      name: "ApplyPatch",
      parameters: { type: "object", properties: {} },
    });
    expect(translated.tool_choice).toEqual({ type: "function", name: "ApplyPatch" });
    expect(translated.parallel_tool_calls).toBe(false);

    const transformed = new CodexExecutor().transformRequest(
      "gpt-5.5",
      structuredClone(translated),
      true,
      { rawHeaders: {}, connectionId: "test-conn" },
    );

    const functionCall = transformed.input.find((item) => item.type === "function_call");
    const functionOutput = transformed.input.find((item) => item.type === "function_call_output");
    expect(functionCall).toMatchObject({ name: "ApplyPatch" });
    expect(functionOutput).toMatchObject({ call_id: functionCall.call_id, output: "patched" });
    expect(transformed.tool_choice).toEqual({ type: "function", name: "ApplyPatch" });
    expect(transformed.parallel_tool_calls).toBe(false);
  });

  it("preserves Cursor flat Responses-style tools sent to chat completions", () => {
    const translated = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.5",
      {
        messages: [{ role: "user", content: "edit this file" }],
        tools: [
          {
            type: "function",
            name: "Shell",
            description: "Run a shell command",
            parameters: { type: "object" },
          },
          {
            type: "function",
            name: "ApplyPatch",
            description: "Apply a unified patch",
            parameters: { type: "object" },
          },
        ],
        tool_choice: { type: "function", name: "ApplyPatch" },
      },
      true,
      null,
      "codex",
    );

    expect(translated.tools.map((tool) => tool.name)).toEqual(["Shell", "ApplyPatch"]);
    expect(translated.tools[0]).toMatchObject({
      type: "function",
      name: "Shell",
      parameters: { type: "object", properties: {} },
    });
    expect(translated.tool_choice).toEqual({ type: "function", name: "ApplyPatch" });

    const transformed = new CodexExecutor().transformRequest(
      "gpt-5.5",
      structuredClone(translated),
      true,
      { rawHeaders: {}, connectionId: "test-conn" },
    );

    expect(transformed.tools.map((tool) => tool.name)).toEqual(["Shell", "ApplyPatch"]);
    expect(transformed.tool_choice).toEqual({ type: "function", name: "ApplyPatch" });
    expect(transformed.parallel_tool_calls).toBe(false);
  });

  it("preserves Cursor ApplyPatch custom tools with grammar format for Codex", () => {
    const translated = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.5",
      {
        messages: [{ role: "user", content: "edit this file" }],
        tools: [
          {
            type: "function",
            name: "Shell",
            description: "Execute shell commands",
            parameters: { type: "object" },
          },
          {
            type: "custom",
            name: "ApplyPatch",
            description: "Apply a unified patch to files",
            format: {
              type: "grammar",
              syntax: "lark",
              definition: "start: /.+/s",
            },
          },
        ],
        tool_choice: { type: "function", name: "ApplyPatch" },
      },
      true,
      null,
      "codex",
    );

    expect(translated.tools.map((tool) => tool.type)).toEqual(["function", "custom"]);
    expect(translated.tools[1]).toMatchObject({
      type: "custom",
      name: "ApplyPatch",
      format: { type: "grammar" },
    });

    const transformed = new CodexExecutor().transformRequest(
      "gpt-5.5",
      structuredClone(translated),
      true,
      { rawHeaders: {}, connectionId: "test-conn" },
    );

    expect(transformed.tools.map((tool) => [tool.type, tool.name])).toEqual([
      ["custom", "ApplyPatch"],
      ["function", "Shell"],
    ]);
    expect(transformed.tools[0]).toMatchObject({
      type: "custom",
      name: "ApplyPatch",
      format: { type: "grammar", syntax: "lark" },
    });
    expect(transformed.tools[1].description).toMatch(/Do not use this tool to edit files/i);
    expect(transformed.tool_choice).toEqual({ type: "custom", name: "ApplyPatch" });
    expect(transformed.parallel_tool_calls).toBe(false);
  });

  it("includes custom_tool_call items in forced Responses SSE to JSON", async () => {
    const providerResponse = new Response(
      encodeResponsesSse([
        { type: "response.created", response: { id: "resp_json", created_at: 123 } },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: "ctc_1",
            type: "custom_tool_call",
            call_id: "call_custom_1",
            custom: { name: "ApplyPatch" },
            input: { patch: "*** Begin Patch" },
          },
        },
        {
          type: "response.completed",
          response: { usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } },
        },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    const result = await handleForcedSSEToJson({
      providerResponse,
      sourceFormat: FORMATS.OPENAI,
      provider: "codex",
      model: "gpt-5.5",
      body: { messages: [] },
      stream: false,
      translatedBody: {},
      finalBody: null,
      requestStartTime: Date.now(),
      connectionId: "test-conn",
      apiKey: "test-key",
      clientRawRequest: { endpoint: "/v1/chat/completions" },
      onRequestSuccess: vi.fn(),
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    });

    const payload = await result.response.json();
    expect(payload.choices[0].finish_reason).toBe("tool_calls");
    expect(payload.choices[0].message.tool_calls[0]).toMatchObject({
      id: "call_custom_1",
      type: "function",
      function: {
        name: "ApplyPatch",
        arguments: "{\"patch\":\"*** Begin Patch\"}",
      },
    });
  });
});
