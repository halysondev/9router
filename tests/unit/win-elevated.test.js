import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildPowerShellCommand } = require("../../src/mitm/winElevated.js");

function decodePs(encoded) {
  return Buffer.from(encoded, "base64").toString("utf16le");
}

describe("Windows elevated PowerShell runner", () => {
  it("encodes the outer UAC wrapper instead of passing raw single-quoted source", () => {
    const command = buildPowerShellCommand("Write-Output 'ok'", { elevated: true });

    expect(command).toMatch(/^powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand \S+$/);
    expect(command).not.toContain("-Command");
    expect(command).not.toContain("Start-Process powershell");

    const [, outerEncoded] = command.match(/-EncodedCommand (\S+)$/);
    const outerScript = decodePs(outerEncoded);

    expect(outerScript).toContain("Start-Process powershell");
    expect(outerScript).toContain("'-EncodedCommand'");

    const [, innerEncoded] = outerScript.match(/'-EncodedCommand','([^']+)'/);
    expect(decodePs(innerEncoded)).toBe("Write-Output 'ok'");
  });
});
