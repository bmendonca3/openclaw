import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  resolveAllowlistProviderRuntimeGroupPolicy,
  resolveDefaultGroupPolicy,
} from "../config/runtime-group-policy.js";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";
import { listTelegramAccountIds, resolveTelegramAccount } from "../telegram/accounts.js";
import { note } from "../terminal/note.js";

export type DoctorBreakingChangeCheck = {
  id: string;
  introducedIn: string;
  collectWarnings: (cfg: OpenClawConfig) => string[];
};

function hasExplicitAllowEntries(entries?: Array<string | number>): boolean {
  return (entries ?? []).some((entry) => String(entry).trim().length > 0);
}

function hasAccountConfigEntry(cfg: OpenClawConfig, accountId: string): boolean {
  const accounts = cfg.channels?.telegram?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return false;
  }
  const normalizedAccountId = normalizeAccountId(accountId);
  return Object.keys(accounts).some((key) => normalizeAccountId(key) === normalizedAccountId);
}

function collectTelegramGroupAllowlistUpgradeWarnings(cfg: OpenClawConfig): string[] {
  if (!cfg.channels?.telegram) {
    return [];
  }

  const defaultGroupPolicy = resolveDefaultGroupPolicy(cfg);
  const warnings: string[] = [];

  for (const accountId of listTelegramAccountIds(cfg)) {
    const account = resolveTelegramAccount({ cfg, accountId });
    if (!account.enabled || account.tokenSource === "none") {
      continue;
    }

    const { groupPolicy } = resolveAllowlistProviderRuntimeGroupPolicy({
      providerConfigPresent: cfg.channels?.telegram !== undefined,
      groupPolicy: account.config.groupPolicy,
      defaultGroupPolicy,
    });
    if (groupPolicy !== "allowlist") {
      continue;
    }

    const hasGroupOrTopicAllowFrom = Object.values(account.config.groups ?? {}).some((group) => {
      if (hasExplicitAllowEntries(group?.allowFrom)) {
        return true;
      }
      return Object.values(group?.topics ?? {}).some((topic) =>
        hasExplicitAllowEntries(topic?.allowFrom),
      );
    });
    const hasOpenGroupOrTopicOverride = Object.values(account.config.groups ?? {}).some(
      (group) =>
        group?.groupPolicy === "open" ||
        Object.values(group?.topics ?? {}).some((topic) => topic?.groupPolicy === "open"),
    );
    const hasSenderAllowlist =
      hasExplicitAllowEntries(account.config.groupAllowFrom) ||
      hasExplicitAllowEntries(account.config.allowFrom) ||
      hasGroupOrTopicAllowFrom;
    if (hasSenderAllowlist || hasOpenGroupOrTopicOverride) {
      continue;
    }

    const useAccountPath =
      normalizeAccountId(account.accountId) !== DEFAULT_ACCOUNT_ID &&
      hasAccountConfigEntry(cfg, account.accountId);
    const basePath = useAccountPath
      ? `channels.telegram.accounts.${account.accountId}`
      : "channels.telegram";

    warnings.push(
      `- [2026.2.25] Telegram account "${account.accountId}": groupPolicy resolves to "allowlist" but no sender allowlist is configured; group senders will be blocked. Configure ${basePath}.groupAllowFrom (or per-group/per-topic allowFrom) with numeric sender IDs.`,
    );
  }

  return warnings;
}

export const DOCTOR_BREAKING_CHANGE_CHECKS: readonly DoctorBreakingChangeCheck[] = [
  {
    id: "telegram-group-allowlist-migration",
    introducedIn: "2026.2.25",
    collectWarnings: collectTelegramGroupAllowlistUpgradeWarnings,
  },
] as const;

export function collectBreakingChangeUpgradeWarnings(cfg: OpenClawConfig): string[] {
  const lines: string[] = [];
  for (const check of DOCTOR_BREAKING_CHANGE_CHECKS) {
    lines.push(...check.collectWarnings(cfg));
  }
  return lines;
}

export function noteBreakingChangeUpgradeWarnings(cfg: OpenClawConfig): void {
  const warnings = collectBreakingChangeUpgradeWarnings(cfg);
  if (warnings.length === 0) {
    return;
  }

  const lines = [
    ...warnings,
    `- See release notes for migration context, then re-run ${formatCliCommand("openclaw doctor")} after applying changes.`,
  ];
  note(lines.join("\n"), "Upgrade");
}
