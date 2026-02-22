import { resolveAgentConfig } from "../../agents/agent-scope.js";
import { getChannelDock } from "../../channels/dock.js";
import { normalizeChannelId } from "../../channels/plugins/index.js";
import { CHAT_CHANNEL_ORDER } from "../../channels/registry.js";
import type { AgentElevatedAllowFromConfig, OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { normalizeAtHashSlug } from "../../shared/string-normalization.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import type { MsgContext } from "../templating.js";
import type { ElevatedLevel } from "./directives.js";
export { formatElevatedUnavailableMessage } from "./elevated-unavailable.js";

function normalizeAllowToken(value?: string) {
  if (!value) {
    return "";
  }
  return value.trim().toLowerCase();
}

function slugAllowToken(value?: string) {
  return normalizeAtHashSlug(value);
}

const SENDER_PREFIXES = [
  ...CHAT_CHANNEL_ORDER,
  INTERNAL_MESSAGE_CHANNEL,
  "user",
  "group",
  "channel",
];
const SENDER_PREFIX_RE = new RegExp(`^(${SENDER_PREFIXES.join("|")}):`, "i");
export const ELEVATED_EXEC_TOOL = "exec";
const DEFAULT_ELEVATED_TTL_MS = 120_000;
const MIN_ELEVATED_TTL_MS = 10_000;
const MAX_ELEVATED_TTL_MS = 15 * 60 * 1000;

function clampElevatedTtlMs(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ELEVATED_TTL_MS;
  }
  const rounded = Math.trunc(value);
  if (rounded <= 0) {
    return DEFAULT_ELEVATED_TTL_MS;
  }
  return Math.max(MIN_ELEVATED_TTL_MS, Math.min(MAX_ELEVATED_TTL_MS, rounded));
}

function mapLevelToGrant(level: ElevatedLevel | undefined): "off" | "ask" | "full" {
  if (level === "full") {
    return "full";
  }
  if (level === "ask" || level === "on") {
    return "ask";
  }
  return "off";
}

function resolveRequestedLevel(level: ElevatedLevel | undefined): ElevatedLevel {
  if (level === "off" || level === "ask" || level === "full" || level === "on") {
    return level;
  }
  return "off";
}

type ElevatedSessionState = {
  elevatedLevel?: unknown;
  elevatedGrants?: unknown;
};

export function resolveElevatedGrantTtlMs(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): number {
  const agentTtl = resolveAgentConfig(params.cfg, params.agentId)?.tools?.elevated?.ttlMs;
  const globalTtl = params.cfg.tools?.elevated?.ttlMs;
  const raw = typeof agentTtl === "number" ? agentTtl : globalTtl;
  return typeof raw === "number" ? clampElevatedTtlMs(raw) : DEFAULT_ELEVATED_TTL_MS;
}

export function setSessionElevatedToolGrant(params: {
  sessionEntry: SessionEntry;
  toolName: string;
  level: "ask" | "full";
  ttlMs: number;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const expiresAt = now + clampElevatedTtlMs(params.ttlMs);
  const existing = sessionEntryGrants(params.sessionEntry);
  existing[params.toolName] = {
    level: params.level,
    issuedAt: now,
    expiresAt,
  };
}

export function clearSessionElevatedToolGrant(params: {
  sessionEntry: SessionEntry;
  toolName: string;
}) {
  if (!params.sessionEntry.elevatedGrants) {
    return;
  }
  delete params.sessionEntry.elevatedGrants[params.toolName];
  if (Object.keys(params.sessionEntry.elevatedGrants).length === 0) {
    delete params.sessionEntry.elevatedGrants;
  }
}

function sessionEntryGrants(
  sessionEntry: SessionEntry,
): NonNullable<SessionEntry["elevatedGrants"]> {
  if (!sessionEntry.elevatedGrants) {
    sessionEntry.elevatedGrants = {};
  }
  return sessionEntry.elevatedGrants;
}

export function resolveSessionElevatedToolGrant(params: {
  sessionEntry?: ElevatedSessionState;
  toolName: string;
  now?: number;
}): "off" | "ask" | "full" {
  const grants = params.sessionEntry?.elevatedGrants;
  if (!grants || typeof grants !== "object" || Array.isArray(grants)) {
    return "off";
  }
  const entry = (grants as Record<string, unknown>)[params.toolName];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return "off";
  }
  const level = (entry as { level?: unknown }).level;
  const expiresAt = (entry as { expiresAt?: unknown }).expiresAt;
  if (level !== "ask" && level !== "full") {
    return "off";
  }
  const now = params.now ?? Date.now();
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return "off";
  }
  return level === "full" ? "full" : "ask";
}

export function resolveEffectiveElevatedExecLevel(params: {
  directiveLevel?: ElevatedLevel;
  sessionEntry?: ElevatedSessionState;
  fallbackLevel?: ElevatedLevel;
  elevatedAllowed: boolean;
  now?: number;
}): ElevatedLevel {
  if (!params.elevatedAllowed) {
    return "off";
  }

  const directiveLevel = resolveRequestedLevel(params.directiveLevel);
  if (params.directiveLevel !== undefined) {
    const mapped = mapLevelToGrant(directiveLevel);
    if (mapped === "full") {
      return "full";
    }
    if (mapped === "ask") {
      return "ask";
    }
    return "off";
  }

  const sessionLevel = resolveRequestedLevel(params.sessionEntry?.elevatedLevel as ElevatedLevel);
  const hasSessionOverride = typeof params.sessionEntry?.elevatedLevel === "string";
  if (hasSessionOverride && sessionLevel === "off") {
    return "off";
  }
  if (sessionLevel !== "off") {
    const grant = resolveSessionElevatedToolGrant({
      sessionEntry: params.sessionEntry,
      toolName: ELEVATED_EXEC_TOOL,
      now: params.now,
    });
    if (grant === "off") {
      return "off";
    }
    if (sessionLevel === "full") {
      return grant === "full" ? "full" : "ask";
    }
    return "ask";
  }

  const fallback = resolveRequestedLevel(params.fallbackLevel);
  return fallback === "off" ? "off" : fallback;
}

function stripSenderPrefix(value?: string) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.replace(SENDER_PREFIX_RE, "");
}

function resolveElevatedAllowList(
  allowFrom: AgentElevatedAllowFromConfig | undefined,
  provider: string,
  fallbackAllowFrom?: Array<string | number>,
): Array<string | number> | undefined {
  if (!allowFrom) {
    return fallbackAllowFrom;
  }
  const value = allowFrom[provider];
  return Array.isArray(value) ? value : fallbackAllowFrom;
}

function isApprovedElevatedSender(params: {
  provider: string;
  ctx: MsgContext;
  allowFrom?: AgentElevatedAllowFromConfig;
  fallbackAllowFrom?: Array<string | number>;
}): boolean {
  const rawAllow = resolveElevatedAllowList(
    params.allowFrom,
    params.provider,
    params.fallbackAllowFrom,
  );
  if (!rawAllow || rawAllow.length === 0) {
    return false;
  }

  const allowTokens = rawAllow.map((entry) => String(entry).trim()).filter(Boolean);
  if (allowTokens.length === 0) {
    return false;
  }
  if (allowTokens.some((entry) => entry === "*")) {
    return true;
  }

  const tokens = new Set<string>();
  const addToken = (value?: string) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    tokens.add(trimmed);
    const normalized = normalizeAllowToken(trimmed);
    if (normalized) {
      tokens.add(normalized);
    }
    const slugged = slugAllowToken(trimmed);
    if (slugged) {
      tokens.add(slugged);
    }
  };

  addToken(params.ctx.SenderName);
  addToken(params.ctx.SenderUsername);
  addToken(params.ctx.SenderTag);
  addToken(params.ctx.SenderE164);
  addToken(params.ctx.From);
  addToken(stripSenderPrefix(params.ctx.From));
  addToken(params.ctx.To);
  addToken(stripSenderPrefix(params.ctx.To));

  for (const rawEntry of allowTokens) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }
    const stripped = stripSenderPrefix(entry);
    if (tokens.has(entry) || tokens.has(stripped)) {
      return true;
    }
    const normalized = normalizeAllowToken(stripped);
    if (normalized && tokens.has(normalized)) {
      return true;
    }
    const slugged = slugAllowToken(stripped);
    if (slugged && tokens.has(slugged)) {
      return true;
    }
  }

  return false;
}

export function resolveElevatedPermissions(params: {
  cfg: OpenClawConfig;
  agentId: string;
  ctx: MsgContext;
  provider: string;
}): {
  enabled: boolean;
  allowed: boolean;
  failures: Array<{ gate: string; key: string }>;
} {
  const globalConfig = params.cfg.tools?.elevated;
  const agentConfig = resolveAgentConfig(params.cfg, params.agentId)?.tools?.elevated;
  const globalEnabled = globalConfig?.enabled !== false;
  const agentEnabled = agentConfig?.enabled !== false;
  const enabled = globalEnabled && agentEnabled;
  const failures: Array<{ gate: string; key: string }> = [];
  if (!globalEnabled) {
    failures.push({ gate: "enabled", key: "tools.elevated.enabled" });
  }
  if (!agentEnabled) {
    failures.push({
      gate: "enabled",
      key: "agents.list[].tools.elevated.enabled",
    });
  }
  if (!enabled) {
    return { enabled, allowed: false, failures };
  }
  if (!params.provider) {
    failures.push({ gate: "provider", key: "ctx.Provider" });
    return { enabled, allowed: false, failures };
  }

  const normalizedProvider = normalizeChannelId(params.provider);
  const dockFallbackAllowFrom = normalizedProvider
    ? getChannelDock(normalizedProvider)?.elevated?.allowFromFallback?.({
        cfg: params.cfg,
        accountId: params.ctx.AccountId,
      })
    : undefined;
  const fallbackAllowFrom = dockFallbackAllowFrom;
  const globalAllowed = isApprovedElevatedSender({
    provider: params.provider,
    ctx: params.ctx,
    allowFrom: globalConfig?.allowFrom,
    fallbackAllowFrom,
  });
  if (!globalAllowed) {
    failures.push({
      gate: "allowFrom",
      key: `tools.elevated.allowFrom.${params.provider}`,
    });
    return { enabled, allowed: false, failures };
  }

  const agentAllowed = agentConfig?.allowFrom
    ? isApprovedElevatedSender({
        provider: params.provider,
        ctx: params.ctx,
        allowFrom: agentConfig.allowFrom,
        fallbackAllowFrom,
      })
    : true;
  if (!agentAllowed) {
    failures.push({
      gate: "allowFrom",
      key: `agents.list[].tools.elevated.allowFrom.${params.provider}`,
    });
  }
  return { enabled, allowed: globalAllowed && agentAllowed, failures };
}
