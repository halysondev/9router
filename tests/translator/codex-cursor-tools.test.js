import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import "./registerAll.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { CodexExecutor } from "../../open-sse/executors/codex.js";
import { convertResponsesApiFormat } from "../../open-sse/translator/formats/responsesApi.js";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
  saveRequestUsage: vi.fn(() => Promise.resolve()),
  trackPendingRequest: vi.fn(),
}));

const { handleForcedSSEToJson } = await import("../../open-sse/handlers/chatCore/sseToJsonHandler.js");
const AGENT_TOOLS_V2 = JSON.parse(fs.readFileSync(new URL("../fixtures/cursor/agent-tools-v2.1.json", import.meta.url), "utf8"));

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

  it("adds Cursor SwitchMode fallback for Codex when Cursor omits the native tool", () => {
    const translated = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.5",
      {
        messages: [{ role: "user", content: "switch to agent mode" }],
        tools: [
          {
            type: "custom",
            name: "ApplyPatch",
            description: "Apply a unified patch to files",
            format: { type: "grammar", syntax: "lark", definition: "start: /.+/s" },
          },
          {
            type: "function",
            name: "AskQuestion",
            description: "Ask the user a question and collect a response",
            parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
          },
          {
            type: "function",
            name: "CallMcpTool",
            description: "Call an MCP tool",
            parameters: { type: "object", properties: {} },
          },
        ],
      },
      true,
      null,
      "codex",
    );

    const transformed = new CodexExecutor().transformRequest(
      "gpt-5.5",
      structuredClone(translated),
      true,
      { rawHeaders: {}, connectionId: "test-conn" },
    );

    const switchMode = transformed.tools.find((tool) => tool.name === "SwitchMode");
    expect(switchMode).toMatchObject({
      type: "function",
      name: "SwitchMode",
      parameters: {
        type: "object",
        properties: {
          target_mode_id: { type: "string" },
          explanation: { type: "string" },
          tool_call_id: { type: "string" },
        },
        required: ["target_mode_id"],
      },
    });
    expect(transformed.tools.filter((tool) => tool.name === "SwitchMode")).toHaveLength(1);
  });

  it("preserves all Agent Tools v2.1 names through Codex normalization", () => {
    const tools = AGENT_TOOLS_V2.map((tool) => tool.name === "apply_patch"
      ? {
          type: "custom",
          name: tool.name,
          description: tool.description,
          format: {
            type: "grammar",
            syntax: "lark",
            definition: "start: /.+/s",
          },
        }
      : {
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });

    const translated = translateRequest(
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
      "gpt-5.5",
      {
        messages: [{ role: "user", content: "verify tools" }],
        tools,
        tool_choice: "auto",
      },
      true,
      null,
      "codex",
    );
    const transformed = new CodexExecutor().transformRequest(
      "gpt-5.5",
      structuredClone(translated),
      true,
      { rawHeaders: {}, connectionId: "test-conn" },
    );

    const expectedNames = AGENT_TOOLS_V2.map((tool) => tool.name);
    const providerNames = transformed.tools.map((tool) => tool.name);
    expect(providerNames).toHaveLength(expectedNames.length);
    expect(expectedNames.filter((name) => !providerNames.includes(name))).toEqual([]);
    expect(transformed.tools[0]).toMatchObject({
      type: "custom",
      name: "apply_patch",
      format: { type: "grammar", syntax: "lark" },
    });
    for (const expectedTool of AGENT_TOOLS_V2.filter((tool) => tool.name !== "apply_patch")) {
      const providerTool = transformed.tools.find((tool) => tool.name === expectedTool.name);
      expect(providerTool).toMatchObject({
        type: "function",
        name: expectedTool.name,
        parameters: expectedTool.parameters,
      });
      if (expectedTool.description) {
        expect(providerTool.description).toContain(expectedTool.description);
      }
    }
    expect(transformed.parallel_tool_calls).toBe(false);
  });

  it("maps standard function_call events for non-ApplyPatch tools", () => {
    const chunks = runResponsesToOpenAI([
      { type: "response.created", response: { id: "resp_function" } },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          id: "fc_1",
          type: "function_call",
          call_id: "call_terminal_1",
          name: "run_terminal_cmd",
        },
      },
      {
        type: "response.function_call_arguments.delta",
        output_index: 0,
        delta: "{\"command\":\"pwd\",\"is_background\":false}",
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          id: "fc_1",
          type: "function_call",
          call_id: "call_terminal_1",
          name: "run_terminal_cmd",
          arguments: "{\"command\":\"pwd\",\"is_background\":false}",
        },
      },
      { type: "response.completed", response: {} },
    ]);

    const toolDeltas = chunks.flatMap((chunk) => chunk.choices?.[0]?.delta?.tool_calls || []);
    expect(toolDeltas[0]).toMatchObject({
      index: 0,
      id: "call_terminal_1",
      type: "function",
      function: { name: "run_terminal_cmd", arguments: "" },
    });
    expect(toolDeltas[1]).toMatchObject({
      index: 0,
      function: { arguments: "{\"command\":\"pwd\",\"is_background\":false}" },
    });
    expect(chunks.at(-1).choices[0].finish_reason).toBe("tool_calls");
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

  it("preserves custom_tool_call history when converting Responses requests to Chat", () => {
    const body = {
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "edit this file" }] },
        {
          type: "custom_tool_call",
          call_id: "call_patch",
          custom: { name: "ApplyPatch" },
          input: { patch: "*** Begin Patch" },
        },
        { type: "custom_tool_call_output", call_id: "call_patch", output: "patched" },
      ],
    };

    const translated = translateRequest(
      FORMATS.OPENAI_RESPONSES,
      FORMATS.OPENAI,
      "gpt-5.5",
      structuredClone(body),
      true,
      null,
      "codex",
    );
    expect(translated.messages[1]).toMatchObject({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_patch",
          type: "function",
          function: {
            name: "ApplyPatch",
            arguments: "{\"patch\":\"*** Begin Patch\"}",
          },
        },
      ],
    });
    expect(translated.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call_patch",
      content: "patched",
    });

    const converted = convertResponsesApiFormat(structuredClone(body));
    expect(converted.messages[1]).toMatchObject(translated.messages[1]);
    expect(converted.messages[2]).toMatchObject(translated.messages[2]);
  });
});
