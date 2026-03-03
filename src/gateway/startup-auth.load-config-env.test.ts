import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempHome } from "../config/home-env.test-harness.js";
import { createConfigIO } from "../config/io.js";
import type { OpenClawConfig } from "../config/types.js";
import { ensureGatewayStartupAuth } from "./startup-auth.js";

describe("gateway startup auth config loading", () => {
  it("preserves config env vars when startup auth boots from loadConfig", async () => {
    await withTempHome("openclaw-startup-auth-load-config-", async (home) => {
      const configPath = path.join(home, ".openclaw", "openclaw.json");
      const config: OpenClawConfig = {
        env: {
          vars: {
            OPENCLAW_GATEWAY_TOKEN: "token-from-config-env",
          },
        },
      };

      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

      const env = { HOME: home } as NodeJS.ProcessEnv;
      const io = createConfigIO({ env, homedir: () => home });
      const loaded = io.loadConfig();

      expect(env.OPENCLAW_GATEWAY_TOKEN).toBe("token-from-config-env");

      const loadedResult = await ensureGatewayStartupAuth({
        cfg: loaded,
        env,
        persist: false,
      });
      expect(loadedResult.generatedToken).toBeUndefined();
      expect(loadedResult.auth.mode).toBe("token");
      expect(loadedResult.auth.token).toBe("token-from-config-env");

      const snapshot = await io.readConfigFileSnapshot();
      const rawEnv = { HOME: home } as NodeJS.ProcessEnv;
      const snapshotResult = await ensureGatewayStartupAuth({
        cfg: snapshot.config,
        env: rawEnv,
        persist: false,
      });
      expect(snapshotResult.generatedToken).toMatch(/^[0-9a-f]{48}$/);
    });
  });
});
