import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig, HookConfig } from "../config/config.js";
import type { HookInstallRecord } from "../config/types.hooks.js";
import {
  evaluateRuntimeEligibility,
  hasBinary,
  isConfigPathTruthyWithDefaults,
  resolveConfigPath,
  resolveRuntimePlatform,
} from "../shared/config-eval.js";
import { resolveHookKey } from "./frontmatter.js";
import type { HookEligibilityContext, HookEntry } from "./types.js";

const DEFAULT_CONFIG_VALUES: Record<string, boolean> = {
  "browser.enabled": true,
  "browser.evaluateEnabled": true,
  "workspace.dir": true,
};

export { hasBinary, resolveConfigPath, resolveRuntimePlatform };

export function isConfigPathTruthy(config: OpenClawConfig | undefined, pathStr: string): boolean {
  return isConfigPathTruthyWithDefaults(config, pathStr, DEFAULT_CONFIG_VALUES);
}

export function resolveHookConfig(
  config: OpenClawConfig | undefined,
  hookKey: string,
): HookConfig | undefined {
  const hooks = config?.hooks?.internal?.entries;
  if (!hooks || typeof hooks !== "object") {
    return undefined;
  }
  const entry = (hooks as Record<string, HookConfig | undefined>)[hookKey];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  return entry;
}

function findHookInstallRecord(
  installs: Record<string, HookInstallRecord> | undefined,
  hookName: string,
): HookInstallRecord | undefined {
  if (!installs) {
    return undefined;
  }
  const direct = installs[hookName];
  if (direct) {
    return direct;
  }
  for (const record of Object.values(installs)) {
    if (Array.isArray(record.hooks) && record.hooks.includes(hookName)) {
      return record;
    }
  }
  return undefined;
}

function readHookPackageVersion(baseDir: string): string | undefined {
  const packagePath = path.join(baseDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(packagePath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    const value = typeof parsed.version === "string" ? parsed.version.trim() : "";
    return value || undefined;
  } catch {
    return undefined;
  }
}

function passesManagedHookIntegrityGate(entry: HookEntry, config?: OpenClawConfig): boolean {
  if (config?.hooks?.internal?.requireInstallIntegrity !== true) {
    return true;
  }
  if (entry.hook.source !== "openclaw-managed") {
    return true;
  }

  const installRecord = findHookInstallRecord(config.hooks?.internal?.installs, entry.hook.name);
  if (!installRecord) {
    return false;
  }
  const integrity =
    typeof installRecord.integrity === "string" ? installRecord.integrity.trim() : "";
  if (!integrity) {
    return false;
  }
  const expectedVersionRaw =
    typeof installRecord.resolvedVersion === "string"
      ? installRecord.resolvedVersion
      : installRecord.version;
  const expectedVersion = expectedVersionRaw?.trim();
  const localVersion = readHookPackageVersion(entry.hook.baseDir);
  if (expectedVersion && localVersion && expectedVersion !== localVersion) {
    return false;
  }
  return true;
}

function evaluateHookRuntimeEligibility(params: {
  entry: HookEntry;
  config?: OpenClawConfig;
  hookConfig?: HookConfig;
  eligibility?: HookEligibilityContext;
}): boolean {
  const { entry, config, hookConfig, eligibility } = params;
  const remote = eligibility?.remote;
  const base = {
    os: entry.metadata?.os,
    remotePlatforms: remote?.platforms,
    always: entry.metadata?.always,
    requires: entry.metadata?.requires,
    hasRemoteBin: remote?.hasBin,
    hasAnyRemoteBin: remote?.hasAnyBin,
  };
  return evaluateRuntimeEligibility({
    ...base,
    hasBin: hasBinary,
    hasEnv: (envName) => Boolean(process.env[envName] || hookConfig?.env?.[envName]),
    isConfigPathTruthy: (configPath) => isConfigPathTruthy(config, configPath),
  });
}

export function shouldIncludeHook(params: {
  entry: HookEntry;
  config?: OpenClawConfig;
  eligibility?: HookEligibilityContext;
}): boolean {
  const { entry, config, eligibility } = params;
  const hookKey = resolveHookKey(entry.hook.name, entry);
  const hookConfig = resolveHookConfig(config, hookKey);
  const pluginManaged = entry.hook.source === "openclaw-plugin";

  // Check if explicitly disabled
  if (!pluginManaged && hookConfig?.enabled === false) {
    return false;
  }
  if (!passesManagedHookIntegrityGate(entry, config)) {
    return false;
  }

  return evaluateHookRuntimeEligibility({
    entry,
    config,
    hookConfig,
    eligibility,
  });
}
