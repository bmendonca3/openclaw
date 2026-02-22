import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyTamperAuditLogMock = vi.fn();
const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../security/tamper-audit-log.js", () => ({
  verifyTamperAuditLog: verifyTamperAuditLogMock,
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime: runtime,
}));

const { registerAuditCli } = await import("./audit-cli.js");

describe("registerAuditCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function runCli(args: string[]) {
    const program = new Command();
    registerAuditCli(program);
    await program.parseAsync(args, { from: "user" });
  }

  it("prints JSON output when --json is passed", async () => {
    verifyTamperAuditLogMock.mockResolvedValueOnce({
      ok: true,
      filePath: "/tmp/tool-audit.jsonl",
      count: 2,
      lastHash: "abc",
    });

    await runCli(["audit", "verify", "--json"]);

    expect(verifyTamperAuditLogMock).toHaveBeenCalledWith({ filePath: undefined });
    expect(runtime.log).toHaveBeenCalledWith(
      JSON.stringify(
        {
          ok: true,
          filePath: "/tmp/tool-audit.jsonl",
          count: 2,
          lastHash: "abc",
        },
        null,
        2,
      ),
    );
  });

  it("exits with error when verification fails", async () => {
    verifyTamperAuditLogMock.mockResolvedValueOnce({
      ok: false,
      filePath: "/tmp/tool-audit.jsonl",
      count: 1,
      line: 2,
      error: "hash mismatch",
    });

    await runCli(["audit", "verify"]);

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("verification failed"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });
});
