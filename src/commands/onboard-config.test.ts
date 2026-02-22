import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  applyOnboardingLockdownConfig,
  applyOnboardingLocalWorkspaceConfig,
  ONBOARDING_LOCKDOWN_DENY_TOOLS,
  ONBOARDING_DEFAULT_DM_SCOPE,
} from "./onboard-config.js";

describe("applyOnboardingLocalWorkspaceConfig", () => {
  it("sets secure dmScope default when unset", () => {
    const baseConfig: OpenClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
    expect(result.gateway?.mode).toBe("local");
    expect(result.agents?.defaults?.workspace).toBe("/tmp/workspace");
  });

  it("preserves existing dmScope when already configured", () => {
    const baseConfig: OpenClawConfig = {
      session: {
        dmScope: "main",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("main");
  });

  it("preserves explicit non-main dmScope values", () => {
    const baseConfig: OpenClawConfig = {
      session: {
        dmScope: "per-account-channel-peer",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("per-account-channel-peer");
  });
});

describe("applyOnboardingLockdownConfig", () => {
  it("forces secure lockdown defaults", () => {
    const baseConfig: OpenClawConfig = {
      gateway: {
        bind: "lan",
        tailscale: { mode: "serve" },
      },
      tools: {
        deny: ["web_fetch"],
      },
      agents: {
        defaults: {
          sandbox: {
            mode: "off",
          },
        },
      },
    };

    const result = applyOnboardingLockdownConfig(baseConfig);

    expect(result.gateway?.bind).toBe("loopback");
    expect(result.gateway?.tailscale?.mode).toBe("off");
    expect(result.tools?.profile).toBe("lockdown");
    expect(result.agents?.defaults?.sandbox?.mode).toBe("all");
    expect(result.tools?.deny).toEqual(["web_fetch", ...ONBOARDING_LOCKDOWN_DENY_TOOLS]);
  });

  it("does not duplicate required deny entries", () => {
    const baseConfig: OpenClawConfig = {
      tools: {
        deny: ["exec", "nodes", "browser", "exec"],
      },
    };

    const result = applyOnboardingLockdownConfig(baseConfig);
    expect(result.tools?.deny).toEqual(["exec", "nodes", "browser"]);
  });
});
