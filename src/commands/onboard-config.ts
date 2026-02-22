import type { OpenClawConfig } from "../config/config.js";
import type { DmScope } from "../config/types.base.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: OpenClawConfig,
  workspaceDir: string,
  opts?: { enableSandboxDefaults?: boolean },
): OpenClawConfig {
  const enableSandboxDefaults = opts?.enableSandboxDefaults === true;
  const existingSandbox = baseConfig.agents?.defaults?.sandbox;
  const sandboxDefaults = enableSandboxDefaults
    ? {
        ...existingSandbox,
        mode: existingSandbox?.mode ?? "non-main",
        workspaceAccess: existingSandbox?.workspaceAccess ?? "none",
      }
    : existingSandbox;

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
        ...(sandboxDefaults ? { sandbox: sandboxDefaults } : {}),
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
    session: {
      ...baseConfig.session,
      dmScope: baseConfig.session?.dmScope ?? ONBOARDING_DEFAULT_DM_SCOPE,
    },
  };
}
