import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertGatewayStartupPermissionSafety } from "./startup-permissions.js";

const isWindows = process.platform === "win32";

describe("assertGatewayStartupPermissionSafety", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  const createFixture = async () => {
    const dir = path.join(fixtureRoot, `startup-perms-${fixtureCount++}`);
    const stateDir = path.join(dir, ".openclaw");
    const credentialsDir = path.join(stateDir, "credentials");
    const configPath = path.join(stateDir, "openclaw.json");
    const envPath = path.join(stateDir, ".env");
    const credentialFile = path.join(credentialsDir, "oauth.json");

    await fs.mkdir(credentialsDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(configPath, "{}\n", { encoding: "utf-8", mode: 0o600 });
    await fs.writeFile(envPath, "OPENCLAW_GATEWAY_TOKEN=secret\n", {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.writeFile(credentialFile, "{}\n", { encoding: "utf-8", mode: 0o600 });

    await fs.chmod(stateDir, 0o700).catch(() => {});
    await fs.chmod(credentialsDir, 0o700).catch(() => {});
    await fs.chmod(configPath, 0o600).catch(() => {});
    await fs.chmod(envPath, 0o600).catch(() => {});
    await fs.chmod(credentialFile, 0o600).catch(() => {});

    return { stateDir, credentialsDir, configPath, envPath, credentialFile };
  };

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-gateway-startup-perms-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("allows startup when state/config/env/credentials are private", async () => {
    const fixture = await createFixture();
    await expect(
      assertGatewayStartupPermissionSafety({
        stateDir: fixture.stateDir,
        configPath: fixture.configPath,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed when config is world-readable", async () => {
    if (isWindows) {
      return;
    }
    const fixture = await createFixture();
    await fs.chmod(fixture.configPath, 0o644);

    await expect(
      assertGatewayStartupPermissionSafety({
        stateDir: fixture.stateDir,
        configPath: fixture.configPath,
      }),
    ).rejects.toThrow(/doctor --fix/i);
    await expect(
      assertGatewayStartupPermissionSafety({
        stateDir: fixture.stateDir,
        configPath: fixture.configPath,
      }),
    ).rejects.toThrow(/config file is world-readable/i);
  });

  it("fails closed when credentials files are group/world-readable", async () => {
    if (isWindows) {
      return;
    }
    const fixture = await createFixture();
    await fs.chmod(fixture.credentialFile, 0o640);

    await expect(
      assertGatewayStartupPermissionSafety({
        stateDir: fixture.stateDir,
        configPath: fixture.configPath,
      }),
    ).rejects.toThrow(/credentials file is group-readable/i);
  });
});
