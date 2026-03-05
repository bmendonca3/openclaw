import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { expandHomePrefix } from "../infra/home-dir.js";
import { CONFIG_DIR } from "../utils.js";
import type { CronStoreFile } from "./types.js";

export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");
export const DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json");
const serializedStoreCache = new Map<string, string>();
const CRON_DIR_MODE = 0o700;
const CRON_FILE_MODE = 0o600;

async function ensureCronDir(dirPath: string) {
  await fs.promises.mkdir(dirPath, { recursive: true, mode: CRON_DIR_MODE });
  const stat = await fs.promises.lstat(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`cron dir must be a real directory: ${dirPath}`);
  }
  await ensureCronFileMode(dirPath, CRON_DIR_MODE);
}

async function ensureCronFileMode(filePath: string, mode = CRON_FILE_MODE) {
  try {
    await fs.promises.chmod(filePath, mode);
    return;
  } catch (err) {
    if (process.platform !== "win32") {
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (stat && (stat.mode & 0o077) !== 0) {
        throw err;
      }
    }
  }
}

async function assertNotSymlink(filePath: string) {
  const stat = await fs.promises.lstat(filePath).catch((err: unknown) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  });
  if (stat?.isSymbolicLink()) {
    throw new Error(`refusing to use symlink for cron file: ${filePath}`);
  }
}

async function writeCronFile(filePath: string, contents: string) {
  await assertNotSymlink(filePath);
  const tmp = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.promises.writeFile(tmp, contents, { encoding: "utf-8", mode: CRON_FILE_MODE });
  await fs.promises.rename(tmp, filePath);
}

async function copyCronFile(sourcePath: string, destPath: string) {
  const contents = await fs.promises.readFile(sourcePath, "utf-8");
  await assertNotSymlink(destPath);
  await fs.promises.writeFile(destPath, contents, { encoding: "utf-8", mode: CRON_FILE_MODE });
  await ensureCronFileMode(destPath);
}

export function resolveCronStorePath(storePath?: string) {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(expandHomePrefix(raw));
    }
    return path.resolve(raw);
  }
  return DEFAULT_CRON_STORE_PATH;
}

export async function loadCronStore(storePath: string): Promise<CronStoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON5.parse(raw);
    } catch (err) {
      throw new Error(`Failed to parse cron store at ${storePath}: ${String(err)}`, {
        cause: err,
      });
    }
    const parsedRecord =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const jobs = Array.isArray(parsedRecord.jobs) ? (parsedRecord.jobs as never[]) : [];
    const store = {
      version: 1 as const,
      jobs: jobs.filter(Boolean) as never as CronStoreFile["jobs"],
    };
    serializedStoreCache.set(storePath, JSON.stringify(store, null, 2));
    return store;
  } catch (err) {
    if ((err as { code?: unknown })?.code === "ENOENT") {
      serializedStoreCache.delete(storePath);
      return { version: 1, jobs: [] };
    }
    throw err;
  }
}

type SaveCronStoreOptions = {
  skipBackup?: boolean;
};

export async function saveCronStore(
  storePath: string,
  store: CronStoreFile,
  opts?: SaveCronStoreOptions,
) {
  await ensureCronDir(path.dirname(storePath));
  const json = JSON.stringify(store, null, 2);
  const cached = serializedStoreCache.get(storePath);
  if (cached === json) {
    return;
  }

  let previous: string | null = cached ?? null;
  if (previous === null) {
    try {
      previous = await fs.promises.readFile(storePath, "utf-8");
    } catch (err) {
      if ((err as { code?: unknown }).code !== "ENOENT") {
        throw err;
      }
    }
  }
  if (previous === json) {
    serializedStoreCache.set(storePath, json);
    return;
  }
  if (previous !== null && !opts?.skipBackup) {
    try {
      await writeCronFile(`${storePath}.bak`, previous);
    } catch {
      // best-effort
    }
  }
  await writeCronFileWithRetry(storePath, json);
  serializedStoreCache.set(storePath, json);
}

const RENAME_MAX_RETRIES = 3;
const RENAME_BASE_DELAY_MS = 50;

async function writeCronFileWithRetry(dest: string, contents: string): Promise<void> {
  const tmp = `${dest}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.promises.writeFile(tmp, contents, { encoding: "utf-8", mode: CRON_FILE_MODE });
  for (let attempt = 0; attempt <= RENAME_MAX_RETRIES; attempt++) {
    try {
      await assertNotSymlink(dest);
      await fs.promises.rename(tmp, dest);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "EBUSY" && attempt < RENAME_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RENAME_BASE_DELAY_MS * 2 ** attempt));
        continue;
      }
      // Windows doesn't reliably support atomic replace via rename when dest exists.
      if (code === "EPERM" || code === "EEXIST") {
        await assertNotSymlink(dest);
        await copyCronFile(tmp, dest);
        await fs.promises.unlink(tmp).catch(() => {});
        return;
      }
      throw err;
    }
  }
}
