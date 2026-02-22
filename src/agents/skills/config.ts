import type { OpenClawConfig, SkillConfig } from "../../config/config.js";
import {
  evaluateRuntimeEligibility,
  hasBinary,
  isConfigPathTruthyWithDefaults,
  resolveConfigPath,
  resolveRuntimePlatform,
} from "../../shared/config-eval.js";
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

function normalizePublisherAllowlist(input: unknown): string[] | undefined {
  const normalized = normalizeAllowlist(input);
  if (!normalized) {
    return undefined;
  }
  const lowered = normalized.map((entry) => entry.toLowerCase());
  return lowered.length > 0 ? lowered : undefined;
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

export function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: OpenClawConfig;
  eligibility?: SkillEligibilityContext;
}): boolean {
  const { entry, config, eligibility } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const allowBundled = normalizeAllowlist(config?.skills?.allowBundled);
  const trustedPublishers = normalizePublisherAllowlist(config?.skills?.trustedPublishers);

  if (skillConfig?.enabled === false) {
    return false;
  }
  if (entry.signature?.status === "invalid") {
    return false;
  }
  if (trustedPublishers && trustedPublishers.length > 0) {
    if (entry.signature?.status !== "verified") {
      return false;
    }
    const publisherCandidates = [
      entry.signature.publisher?.trim().toLowerCase(),
      entry.signature.keyId?.trim().toLowerCase(),
    ].filter((value): value is string => Boolean(value));
    if (publisherCandidates.length === 0) {
      return false;
    }
    if (!publisherCandidates.some((candidate) => trustedPublishers.includes(candidate))) {
      return false;
    }
  }
  if (!isBundledSkillAllowed(entry, allowBundled)) {
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
