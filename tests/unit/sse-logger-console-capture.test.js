import { describe, it, expect, beforeEach } from "vitest";
import { clearConsoleLogs, getConsoleLogs } from "@/lib/consoleLogBuffer.js";
import * as log from "@/sse/utils/logger.js";

describe("SSE logger console capture", () => {
  beforeEach(() => {
    clearConsoleLogs();
  });

  it("captures API request logger output for the console log UI", () => {
    log.request("POST", "/v1/chat/completions | capture-test-model");

    expect(
      getConsoleLogs().some((line) =>
        line.includes("POST /v1/chat/completions | capture-test-model")
      )
    ).toBe(true);
  });
});
