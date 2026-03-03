import { describe, expect, it, vi } from "vitest";
import { ConfigWriteConflictError } from "../config/io.js";
import { maybeSeedControlUiAllowedOriginsAtStartup } from "./startup-control-ui-origins.js";

describe("maybeSeedControlUiAllowedOriginsAtStartup", () => {
  it("logs a startup-skip warning on config write conflicts", async () => {
    const info = vi.fn();
    const warn = vi.fn();

    const result = await maybeSeedControlUiAllowedOriginsAtStartup({
      config: {
        gateway: {
          bind: "lan",
          port: 18789,
        },
      },
      configPath: "/tmp/openclaw.json",
      writeConfig: async () => {
        throw new ConfigWriteConflictError({
          configPath: "/tmp/openclaw.json",
          expectedHash: "old",
          actualHash: "new",
        });
      },
      log: { info, warn },
    });

    expect(result).toBeTruthy();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "gateway: skipped gateway.controlUi.allowedOrigins seed because /tmp/openclaw.json changed on disk during startup.",
    );
  });
});
