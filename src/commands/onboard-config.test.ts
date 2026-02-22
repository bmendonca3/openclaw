import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  applyOnboardingLocalWorkspaceConfig,
  ONBOARDING_DEFAULT_DM_SCOPE,
} from "./onboard-config.js";

describe("applyOnboardingLocalWorkspaceConfig", () => {
  it("sets workspace and local gateway mode", () => {
    const input: OpenClawConfig = { gateway: { mode: "remote" } };
    const result = applyOnboardingLocalWorkspaceConfig(input, "/tmp/workspace");

    expect(result.gateway?.mode).toBe("local");
    expect(result.agents?.defaults?.workspace).toBe("/tmp/workspace");
  });

  it("sets secure dmScope default when unset", () => {
    const baseConfig: OpenClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
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

  it("applies sandbox defaults when docker is available", () => {
    const input: OpenClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(input, "/tmp/workspace", {
      enableSandboxDefaults: true,
    });

    expect(result.agents?.defaults?.sandbox?.mode).toBe("non-main");
    expect(result.agents?.defaults?.sandbox?.workspaceAccess).toBe("none");
  });

  it("preserves explicit sandbox settings when docker defaults are enabled", () => {
    const input: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
            workspaceAccess: "rw",
          },
        },
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(input, "/tmp/workspace", {
      enableSandboxDefaults: true,
    });

    expect(result.agents?.defaults?.sandbox?.mode).toBe("all");
    expect(result.agents?.defaults?.sandbox?.workspaceAccess).toBe("rw");
  });

  it("does not create sandbox defaults when docker is unavailable", () => {
    const input: OpenClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(input, "/tmp/workspace", {
      enableSandboxDefaults: false,
    });

    expect(result.agents?.defaults?.sandbox).toBeUndefined();
  });
});
