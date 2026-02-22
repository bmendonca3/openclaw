import type { OpenClawConfig } from "../config/config.js";
import type { DmScope } from "../config/types.base.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";
export const ONBOARDING_LOCKDOWN_DENY_TOOLS = ["exec", "nodes", "browser"] as const;

function mergeUniqueValues(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") {
      continue;
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: OpenClawConfig,
  workspaceDir: string,
): OpenClawConfig {
  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
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

export function applyOnboardingLockdownConfig(baseConfig: OpenClawConfig): OpenClawConfig {
  const existingDeny = Array.isArray(baseConfig.tools?.deny) ? baseConfig.tools.deny : [];
  const mergedDeny = mergeUniqueValues([...existingDeny, ...ONBOARDING_LOCKDOWN_DENY_TOOLS]);
  return {
    ...baseConfig,
    gateway: {
      ...baseConfig.gateway,
      bind: "loopback",
      tailscale: {
        ...baseConfig.gateway?.tailscale,
        mode: "off",
      },
    },
    tools: {
      ...baseConfig.tools,
      profile: "lockdown",
      deny: mergedDeny,
    },
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        sandbox: {
          ...baseConfig.agents?.defaults?.sandbox,
          mode: "all",
        },
      },
    },
  };
}
