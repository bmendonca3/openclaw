import type { OpenClawConfig, SkillConfig } from "../../config/config.js";
import {
  evaluateRuntimeEligibility,
  hasBinary,
  isConfigPathTruthyWithDefaults,
  resolveConfigPath,
  resolveRuntimePlatform,
} from "../../shared/config-eval.js";
import { isToolAllowedByPolicies, resolveEffectiveToolPolicy } from "../pi-tools.policy.js";
import { resolveToolProfilePolicy } from "../tool-policy.js";
import { resolveSkillKey } from "./frontmatter.js";
import type { SkillEligibilityContext, SkillEntry } from "./types.js";

const DEFAULT_CONFIG_VALUES: Record<string, boolean> = {
  "browser.enabled": true,
  "browser.evaluateEnabled": true,
};

export { hasBinary, resolveConfigPath, resolveRuntimePlatform };

export function isConfigPathTruthy(config: OpenClawConfig | undefined, pathStr: string): boolean {
  return isConfigPathTruthyWithDefaults(config, pathStr, DEFAULT_CONFIG_VALUES);
}

export function resolveSkillConfig(
  config: OpenClawConfig | undefined,
  skillKey: string,
): SkillConfig | undefined {
  const skills = config?.skills?.entries;
  if (!skills || typeof skills !== "object") {
    return undefined;
  }
  const entry = (skills as Record<string, SkillConfig | undefined>)[skillKey];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  return entry;
}

function normalizeAllowlist(input: unknown): string[] | undefined {
  if (!input) {
    return undefined;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const normalized = input.map((entry) => String(entry).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

const BUNDLED_SOURCES = new Set(["openclaw-bundled"]);

function isBundledSkill(entry: SkillEntry): boolean {
  return BUNDLED_SOURCES.has(entry.skill.source);
}

export function resolveBundledAllowlist(config?: OpenClawConfig): string[] | undefined {
  return normalizeAllowlist(config?.skills?.allowBundled);
}

export function isBundledSkillAllowed(entry: SkillEntry, allowlist?: string[]): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  if (!isBundledSkill(entry)) {
    return true;
  }
  const key = resolveSkillKey(entry.skill, entry);
  return allowlist.includes(key) || allowlist.includes(entry.skill.name);
}

function isSandboxCapabilityAvailable(config?: OpenClawConfig): boolean {
  const defaultMode = config?.agents?.defaults?.sandbox?.mode;
  if (defaultMode && defaultMode !== "off") {
    return true;
  }
  for (const agent of config?.agents?.list ?? []) {
    if (agent?.sandbox?.mode && agent.sandbox.mode !== "off") {
      return true;
    }
  }
  return false;
}

function resolveToolsProfilePolicy(params: { profile?: string; profileAlsoAllow?: string[] }) {
  const profilePolicy = resolveToolProfilePolicy(params.profile);
  if (!profilePolicy) {
    return undefined;
  }
  const alsoAllow = params.profileAlsoAllow ?? [];
  if (alsoAllow.length === 0) {
    return profilePolicy;
  }
  return {
    ...profilePolicy,
    allow: Array.from(new Set([...(profilePolicy.allow ?? []), ...alsoAllow])),
  };
}

function areSkillCapabilitiesSatisfied(entry: SkillEntry, config?: OpenClawConfig): boolean {
  const capabilities = entry.capabilities;
  if (!capabilities) {
    return true;
  }
  if (capabilities.requiresSandbox === true && !isSandboxCapabilityAvailable(config)) {
    return false;
  }
  if (!capabilities.requiredTools || capabilities.requiredTools.length === 0) {
    return true;
  }
  const effective = resolveEffectiveToolPolicy({ config });
  const profilePolicy = resolveToolsProfilePolicy({
    profile: effective.profile,
    profileAlsoAllow: effective.profileAlsoAllow,
  });
  return capabilities.requiredTools.every((toolName) =>
    isToolAllowedByPolicies(toolName, [effective.globalPolicy, profilePolicy]),
  );
}

export function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: OpenClawConfig;
  eligibility?: SkillEligibilityContext;
}): boolean {
  const { entry, config, eligibility } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const allowBundled = normalizeAllowlist(config?.skills?.allowBundled);

  if (skillConfig?.enabled === false) {
    return false;
  }
  if (!isBundledSkillAllowed(entry, allowBundled)) {
    return false;
  }
  if (!areSkillCapabilitiesSatisfied(entry, config)) {
    return false;
  }
  return evaluateRuntimeEligibility({
    os: entry.metadata?.os,
    remotePlatforms: eligibility?.remote?.platforms,
    always: entry.metadata?.always,
    requires: entry.metadata?.requires,
    hasBin: hasBinary,
    hasRemoteBin: eligibility?.remote?.hasBin,
    hasAnyRemoteBin: eligibility?.remote?.hasAnyBin,
    hasEnv: (envName) =>
      Boolean(
        process.env[envName] ||
        skillConfig?.env?.[envName] ||
        (skillConfig?.apiKey && entry.metadata?.primaryEnv === envName),
      ),
    isConfigPathTruthy: (configPath) => isConfigPathTruthy(config, configPath),
  });
}
