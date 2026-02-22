import type { Skill } from "@mariozechner/pi-coding-agent";
import JSON5 from "json5";
import { parseFrontmatterBlock } from "../../markdown/frontmatter.js";
import {
  getFrontmatterString,
  normalizeStringList,
  parseOpenClawManifestInstallBase,
  parseFrontmatterBool,
  resolveOpenClawManifestBlock,
  resolveOpenClawManifestInstall,
  resolveOpenClawManifestOs,
  resolveOpenClawManifestRequires,
} from "../../shared/frontmatter.js";
import { parseBooleanValue } from "../../utils/boolean.js";
import { normalizeToolName } from "../tool-policy.js";
import type {
  OpenClawSkillMetadata,
  ParsedSkillFrontmatter,
  SkillCapabilityManifest,
  SkillEntry,
  SkillInstallSpec,
  SkillInvocationPolicy,
} from "./types.js";

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  return parseFrontmatterBlock(content);
}

function parseInstallSpec(input: unknown): SkillInstallSpec | undefined {
  const parsed = parseOpenClawManifestInstallBase(input, ["brew", "node", "go", "uv", "download"]);
  if (!parsed) {
    return undefined;
  }
  const { raw } = parsed;
  const spec: SkillInstallSpec = {
    kind: parsed.kind as SkillInstallSpec["kind"],
  };

  if (parsed.id) {
    spec.id = parsed.id;
  }
  if (parsed.label) {
    spec.label = parsed.label;
  }
  if (parsed.bins) {
    spec.bins = parsed.bins;
  }
  const osList = normalizeStringList(raw.os);
  if (osList.length > 0) {
    spec.os = osList;
  }
  const formula = typeof raw.formula === "string" ? raw.formula.trim() : "";
  if (formula) {
    spec.formula = formula;
  }
  const cask = typeof raw.cask === "string" ? raw.cask.trim() : "";
  if (!spec.formula && cask) {
    spec.formula = cask;
  }
  if (typeof raw.package === "string") {
    spec.package = raw.package;
  }
  if (typeof raw.module === "string") {
    spec.module = raw.module;
  }
  if (typeof raw.url === "string") {
    spec.url = raw.url;
  }
  if (typeof raw.archive === "string") {
    spec.archive = raw.archive;
  }
  if (typeof raw.extract === "boolean") {
    spec.extract = raw.extract;
  }
  if (typeof raw.stripComponents === "number") {
    spec.stripComponents = raw.stripComponents;
  }
  if (typeof raw.targetDir === "string") {
    spec.targetDir = raw.targetDir;
  }

  return spec;
}

export function resolveOpenClawMetadata(
  frontmatter: ParsedSkillFrontmatter,
): OpenClawSkillMetadata | undefined {
  const metadataObj = resolveOpenClawManifestBlock({ frontmatter });
  if (!metadataObj) {
    return undefined;
  }
  const requires = resolveOpenClawManifestRequires(metadataObj);
  const install = resolveOpenClawManifestInstall(metadataObj, parseInstallSpec);
  const osRaw = resolveOpenClawManifestOs(metadataObj);
  return {
    always: typeof metadataObj.always === "boolean" ? metadataObj.always : undefined,
    emoji: typeof metadataObj.emoji === "string" ? metadataObj.emoji : undefined,
    homepage: typeof metadataObj.homepage === "string" ? metadataObj.homepage : undefined,
    skillKey: typeof metadataObj.skillKey === "string" ? metadataObj.skillKey : undefined,
    primaryEnv: typeof metadataObj.primaryEnv === "string" ? metadataObj.primaryEnv : undefined,
    os: osRaw.length > 0 ? osRaw : undefined,
    requires: requires,
    install: install.length > 0 ? install : undefined,
  };
}

export function resolveSkillInvocationPolicy(
  frontmatter: ParsedSkillFrontmatter,
): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(getFrontmatterString(frontmatter, "user-invocable"), true),
    disableModelInvocation: parseFrontmatterBool(
      getFrontmatterString(frontmatter, "disable-model-invocation"),
      false,
    ),
  };
}

function parseStructuredFrontmatterValue(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const looksStructured =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksStructured) {
    return undefined;
  }
  try {
    return JSON5.parse(trimmed);
  } catch {
    return undefined;
  }
}

function normalizeCapabilityTools(value: unknown): string[] {
  if (!value) {
    return [];
  }
  const parsed =
    typeof value === "string" ? (parseStructuredFrontmatterValue(value) ?? value) : value;
  const normalized = normalizeStringList(parsed)
    .map((toolName) => normalizeToolName(toolName))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function parseCapabilityBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return parseBooleanValue(value);
}

function resolveCapabilityBlock(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = parseStructuredFrontmatterValue(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

export function resolveSkillCapabilities(
  frontmatter: ParsedSkillFrontmatter,
): SkillCapabilityManifest | undefined {
  const metadataObj = resolveOpenClawManifestBlock({ frontmatter });
  const metadataCapabilities = resolveCapabilityBlock(metadataObj?.capabilities);
  const frontmatterCapabilities = resolveCapabilityBlock(
    getFrontmatterString(frontmatter, "capabilities"),
  );

  const requiredTools = Array.from(
    new Set([
      ...normalizeCapabilityTools(metadataCapabilities?.requiredTools),
      ...normalizeCapabilityTools(metadataCapabilities?.required_tools),
      ...normalizeCapabilityTools(frontmatterCapabilities?.requiredTools),
      ...normalizeCapabilityTools(frontmatterCapabilities?.required_tools),
      ...normalizeCapabilityTools(getFrontmatterString(frontmatter, "required-tools")),
      ...normalizeCapabilityTools(getFrontmatterString(frontmatter, "required_tools")),
      ...normalizeCapabilityTools(getFrontmatterString(frontmatter, "requiredTools")),
    ]),
  );

  const requiresSandboxFlags = [
    parseCapabilityBool(metadataCapabilities?.requiresSandbox),
    parseCapabilityBool(metadataCapabilities?.requires_sandbox),
    parseCapabilityBool(frontmatterCapabilities?.requiresSandbox),
    parseCapabilityBool(frontmatterCapabilities?.requires_sandbox),
    parseCapabilityBool(getFrontmatterString(frontmatter, "requires-sandbox")),
    parseCapabilityBool(getFrontmatterString(frontmatter, "requires_sandbox")),
    parseCapabilityBool(getFrontmatterString(frontmatter, "requiresSandbox")),
  ].filter((value): value is boolean => value !== undefined);
  const requiresSandbox =
    requiresSandboxFlags.length > 0 ? requiresSandboxFlags.some((value) => value) : undefined;

  if (requiredTools.length === 0 && requiresSandbox === undefined) {
    return undefined;
  }

  return {
    ...(requiredTools.length > 0 ? { requiredTools } : {}),
    ...(requiresSandbox === undefined ? {} : { requiresSandbox }),
  };
}

export function resolveSkillKey(skill: Skill, entry?: SkillEntry): string {
  return entry?.metadata?.skillKey ?? skill.name;
}
