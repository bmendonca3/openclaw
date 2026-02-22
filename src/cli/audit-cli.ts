import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { verifyTamperAuditLog } from "../security/tamper-audit-log.js";
import { theme } from "../terminal/theme.js";

type AuditVerifyOptions = {
  file?: string;
  json?: boolean;
};

export function registerAuditCli(program: Command) {
  const audit = program.command("audit").description("Tamper-evident local audit log tools");

  audit
    .command("verify")
    .description("Verify tamper-evident tool audit log hash chain")
    .option("--file <path>", "Audit log path (defaults to state dir audit log)")
    .option("--json", "Print machine-readable JSON output", false)
    .action(async (opts: AuditVerifyOptions) => {
      const result = await verifyTamperAuditLog({ filePath: opts.file });
      if (opts.json) {
        defaultRuntime.log(JSON.stringify(result, null, 2));
      } else if (result.ok) {
        defaultRuntime.log(
          [
            theme.heading("Audit log verified"),
            `File: ${result.filePath}`,
            `Entries: ${result.count}`,
            `Last hash: ${result.lastHash ?? "null"}`,
          ].join("\n"),
        );
      } else {
        defaultRuntime.error(
          [
            theme.error("Audit log verification failed"),
            `File: ${result.filePath}`,
            `Line: ${result.line}`,
            `Entries before failure: ${result.count}`,
            `Error: ${result.error}`,
          ].join("\n"),
        );
        defaultRuntime.exit(1);
      }
    });
}
