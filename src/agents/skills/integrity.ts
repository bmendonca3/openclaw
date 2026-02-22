import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Skill } from "@mariozechner/pi-coding-agent";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const skillsLogger = createSubsystemLogger("skills");
const INTEGRITY_LOCK_REL_PATH = path.join(".clawhub", "openclaw-integrity.json");
const INTEGRITY_LOCK_VERSION = 1;
const IGNORED_DIR_NAMES = new Set([".git", "node_modules", ".clawhub", ".clawdhub", "dist"]);

type SkillIntegrityLock = {
  version: number;
  skills: Record<string, { fingerprint: string }>;
};

function walkSkillFiles(rootDir: string, currentDir: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (IGNORED_DIR_NAMES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkSkillFiles(rootDir, fullPath, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const relPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
    if (!relPath || relPath.startsWith("..")) {
      continue;
    }
    out.push(relPath);
  }
}

function readSkillIntegrityLock(lockPath: string): SkillIntegrityLock {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { version: INTEGRITY_LOCK_VERSION, skills: {} };
    }
    const obj = parsed as Record<string, unknown>;
    const version = typeof obj.version === "number" ? obj.version : INTEGRITY_LOCK_VERSION;
    const rawSkills =
      obj.skills && typeof obj.skills === "object" && !Array.isArray(obj.skills)
        ? (obj.skills as Record<string, unknown>)
        : {};
    const skills: SkillIntegrityLock["skills"] = {};
    for (const [skillName, entry] of Object.entries(rawSkills)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const fingerprint = (entry as Record<string, unknown>).fingerprint;
      if (typeof fingerprint !== "string" || !fingerprint.trim()) {
        continue;
      }
      skills[skillName] = { fingerprint: fingerprint.trim() };
    }
    return { version, skills };
  } catch {
    return { version: INTEGRITY_LOCK_VERSION, skills: {} };
  }
}

function writeSkillIntegrityLock(lockPath: string, lock: SkillIntegrityLock) {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf-8");
}

export function computeSkillFingerprint(skillDir: string): string {
  const rootDir = path.resolve(skillDir);
  const relPaths: string[] = [];
  walkSkillFiles(rootDir, rootDir, relPaths);
  relPaths.sort((left, right) => left.localeCompare(right));

  const hash = createHash("sha256");
  for (const relPath of relPaths) {
    const fullPath = path.join(rootDir, relPath);
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(fullPath);
    } catch {
      continue;
    }
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    hash.update(relPath);
    hash.update(":");
    hash.update(fileHash);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function resolveWorkspaceSkillIntegrity(params: {
  workspaceDir: string;
  skills: Skill[];
}): Map<string, { fingerprint: string; mismatch: boolean }> {
  const result = new Map<string, { fingerprint: string; mismatch: boolean }>();
  if (params.skills.length === 0) {
    return result;
  }

  const lockPath = path.join(params.workspaceDir, INTEGRITY_LOCK_REL_PATH);
  const lock = readSkillIntegrityLock(lockPath);
  let didUpdateLock = false;

  for (const skill of params.skills) {
    let fingerprint = "";
    try {
      fingerprint = computeSkillFingerprint(skill.baseDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skillsLogger.warn(`failed to fingerprint skill ${skill.name}: ${message}`);
      continue;
    }
    const previous = lock.skills[skill.name];
    const mismatch = Boolean(previous?.fingerprint) && previous.fingerprint !== fingerprint;
    result.set(skill.name, { fingerprint, mismatch });

    if (!previous?.fingerprint) {
      lock.skills[skill.name] = { fingerprint };
      didUpdateLock = true;
    }
  }

  if (didUpdateLock) {
    try {
      writeSkillIntegrityLock(lockPath, {
        version: INTEGRITY_LOCK_VERSION,
        skills: lock.skills,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skillsLogger.warn(`failed to update skill integrity lock: ${message}`);
    }
  }

  return result;
}
