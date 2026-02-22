import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export const TOOL_AUDIT_LOG_FILENAME = "tool-audit.jsonl";

export type TamperAuditEntry = {
  version: 1;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
};

type TamperAuditBody = Omit<TamperAuditEntry, "hash">;

export type TamperAuditVerifyResult =
  | {
      ok: true;
      filePath: string;
      count: number;
      lastHash: string | null;
    }
  | {
      ok: false;
      filePath: string;
      count: number;
      line: number;
      error: string;
    };

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const entries = Object.entries(source).toSorted(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      out[key] = canonicalizeJson(child);
    }
    return out;
  }
  return value;
}

function computeHash(body: TamperAuditBody): string {
  const canonical = canonicalizeJson(body);
  const serialized = JSON.stringify(canonical);
  return createHash("sha256").update(serialized).digest("hex");
}

function resolveToolAuditLogPath(filePath?: string): string {
  if (typeof filePath === "string" && filePath.trim().length > 0) {
    return filePath;
  }
  const stateDir = resolveStateDir(process.env, os.homedir);
  return path.join(stateDir, "audit", TOOL_AUDIT_LOG_FILENAME);
}

function parseAuditLine(raw: string): TamperAuditEntry {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return {
    version: (parsed.version as number) ?? 1,
    ts: parsed.ts as number,
    type: parsed.type as string,
    payload: (parsed.payload as Record<string, unknown>) ?? {},
    prevHash: (parsed.prevHash as string | null) ?? null,
    hash: parsed.hash as string,
  };
}

function findLastNonEmptyLine(lines: string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) {
      return line;
    }
  }
  return null;
}

async function readLastHash(filePath: string): Promise<string | null> {
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const lastLine = findLastNonEmptyLine(content.split("\n"));
  if (!lastLine) {
    return null;
  }
  const lastEntry = parseAuditLine(lastLine);
  return typeof lastEntry.hash === "string" && lastEntry.hash.trim().length > 0
    ? lastEntry.hash
    : null;
}

export async function appendTamperAuditEvent(params: {
  type: string;
  payload: Record<string, unknown>;
  ts?: number;
  filePath?: string;
}): Promise<TamperAuditEntry> {
  const filePath = resolveToolAuditLogPath(params.filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const prevHash = await readLastHash(filePath);
  const body: TamperAuditBody = {
    version: 1,
    ts: typeof params.ts === "number" ? params.ts : Date.now(),
    type: params.type,
    payload: params.payload,
    prevHash,
  };
  const entry: TamperAuditEntry = {
    ...body,
    hash: computeHash(body),
  };
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, { encoding: "utf-8", mode: 0o600 });
  return entry;
}

export async function verifyTamperAuditLog(opts?: {
  filePath?: string;
}): Promise<TamperAuditVerifyResult> {
  const filePath = resolveToolAuditLogPath(opts?.filePath);
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, filePath, count: 0, lastHash: null };
    }
    return {
      ok: false,
      filePath,
      count: 0,
      line: 0,
      error: String(error),
    };
  }

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let expectedPrevHash: string | null = null;
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    let entry: TamperAuditEntry;
    try {
      entry = parseAuditLine(lines[index] ?? "");
    } catch (error) {
      return {
        ok: false,
        filePath,
        count,
        line: lineNo,
        error: `invalid JSON: ${String(error)}`,
      };
    }
    if (entry.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        filePath,
        count,
        line: lineNo,
        error: `chain mismatch: expected prevHash=${expectedPrevHash ?? "null"} got ${entry.prevHash ?? "null"}`,
      };
    }
    const body: TamperAuditBody = {
      version: entry.version,
      ts: entry.ts,
      type: entry.type,
      payload: entry.payload,
      prevHash: entry.prevHash,
    };
    const expectedHash = computeHash(body);
    if (entry.hash !== expectedHash) {
      return {
        ok: false,
        filePath,
        count,
        line: lineNo,
        error: "hash mismatch",
      };
    }
    expectedPrevHash = entry.hash;
    count += 1;
  }
  return {
    ok: true,
    filePath,
    count,
    lastHash: expectedPrevHash,
  };
}
