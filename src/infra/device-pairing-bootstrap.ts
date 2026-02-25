import { createHash } from "node:crypto";
import {
  createAsyncLock,
  readJsonFile,
  resolvePairingPaths,
  writeJsonAtomic,
} from "./pairing-files.js";
import { generatePairingToken } from "./pairing-token.js";

export const DEVICE_PAIRING_BOOTSTRAP_TTL_MS = 10 * 60 * 1000;
const DEVICE_PAIRING_BOOTSTRAP_MAX_ACTIVE = 64;

type DevicePairingBootstrapTokenEntry = {
  tokenHash: string;
  createdAtMs: number;
  expiresAtMs: number;
  boundDeviceId?: string;
  firstUsedAtMs?: number;
};

type DevicePairingBootstrapStateFile = Record<string, DevicePairingBootstrapTokenEntry>;

const withLock = createAsyncLock();

function resolveBootstrapTokenPath(baseDir?: string): string {
  const { pendingPath } = resolvePairingPaths(baseDir, "device-bootstrap");
  return pendingPath;
}

async function loadState(baseDir?: string): Promise<DevicePairingBootstrapStateFile> {
  return (
    (await readJsonFile<DevicePairingBootstrapStateFile>(resolveBootstrapTokenPath(baseDir))) ?? {}
  );
}

async function persistState(
  state: DevicePairingBootstrapStateFile,
  baseDir?: string,
): Promise<void> {
  await writeJsonAtomic(resolveBootstrapTokenPath(baseDir), state);
}

function trimToNonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashBootstrapToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function pruneExpiredTokens(state: DevicePairingBootstrapStateFile, nowMs: number): boolean {
  let changed = false;
  for (const [tokenHash, entry] of Object.entries(state)) {
    if (entry.expiresAtMs <= nowMs) {
      delete state[tokenHash];
      changed = true;
    }
  }
  return changed;
}

function enforceTokenLimit(state: DevicePairingBootstrapStateFile): boolean {
  const entries = Object.entries(state);
  if (entries.length <= DEVICE_PAIRING_BOOTSTRAP_MAX_ACTIVE) {
    return false;
  }
  const overflow = entries.length - DEVICE_PAIRING_BOOTSTRAP_MAX_ACTIVE;
  const oldest = entries.toSorted((a, b) => a[1].createdAtMs - b[1].createdAtMs).slice(0, overflow);
  for (const [tokenHash] of oldest) {
    delete state[tokenHash];
  }
  return oldest.length > 0;
}

function resolveNow(nowMs?: number): number {
  return typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
}

function resolveTtl(ttlMs?: number): number {
  if (typeof ttlMs === "number" && Number.isFinite(ttlMs) && ttlMs > 0) {
    return Math.trunc(ttlMs);
  }
  return DEVICE_PAIRING_BOOTSTRAP_TTL_MS;
}

export async function createDevicePairingBootstrapToken(params?: {
  baseDir?: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<{ token: string; expiresAtMs: number }> {
  return await withLock(async () => {
    const nowMs = resolveNow(params?.nowMs);
    const ttlMs = resolveTtl(params?.ttlMs);
    const state = await loadState(params?.baseDir);
    const pruned = pruneExpiredTokens(state, nowMs);
    const capped = enforceTokenLimit(state);
    if (pruned || capped) {
      await persistState(state, params?.baseDir);
    }

    for (let attempts = 0; attempts < 4; attempts++) {
      const token = generatePairingToken();
      const tokenHash = hashBootstrapToken(token);
      if (state[tokenHash]) {
        continue;
      }
      const entry: DevicePairingBootstrapTokenEntry = {
        tokenHash,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
      };
      state[tokenHash] = entry;
      await persistState(state, params?.baseDir);
      return { token, expiresAtMs: entry.expiresAtMs };
    }

    throw new Error("failed to mint bootstrap pairing token");
  });
}

type VerifyBootstrapTokenFailureReason = "invalid-token" | "device-required" | "device-mismatch";

type VerifyBootstrapTokenResult =
  | { ok: true; expiresAtMs: number; boundDeviceId: string }
  | { ok: false; reason: VerifyBootstrapTokenFailureReason };

export async function verifyDevicePairingBootstrapToken(params: {
  token: string;
  deviceId: string;
  baseDir?: string;
  nowMs?: number;
}): Promise<VerifyBootstrapTokenResult> {
  const token = trimToNonEmpty(params.token);
  if (!token) {
    return { ok: false, reason: "invalid-token" };
  }
  const deviceId = trimToNonEmpty(params.deviceId);
  if (!deviceId) {
    return { ok: false, reason: "device-required" };
  }

  return await withLock(async () => {
    const nowMs = resolveNow(params.nowMs);
    const state = await loadState(params.baseDir);
    const pruned = pruneExpiredTokens(state, nowMs);
    const tokenHash = hashBootstrapToken(token);
    const entry = state[tokenHash];
    if (!entry) {
      if (pruned) {
        await persistState(state, params.baseDir);
      }
      return { ok: false, reason: "invalid-token" };
    }
    if (entry.expiresAtMs <= nowMs) {
      delete state[tokenHash];
      await persistState(state, params.baseDir);
      return { ok: false, reason: "invalid-token" };
    }
    if (entry.boundDeviceId && entry.boundDeviceId !== deviceId) {
      if (pruned) {
        await persistState(state, params.baseDir);
      }
      return { ok: false, reason: "device-mismatch" };
    }
    if (!entry.boundDeviceId) {
      entry.boundDeviceId = deviceId;
      entry.firstUsedAtMs = nowMs;
      state[tokenHash] = entry;
      await persistState(state, params.baseDir);
    } else if (pruned) {
      await persistState(state, params.baseDir);
    }
    return { ok: true, expiresAtMs: entry.expiresAtMs, boundDeviceId: entry.boundDeviceId };
  });
}

export async function consumeDevicePairingBootstrapToken(params: {
  token: string;
  deviceId: string;
  baseDir?: string;
  nowMs?: number;
}): Promise<boolean> {
  const token = trimToNonEmpty(params.token);
  const deviceId = trimToNonEmpty(params.deviceId);
  if (!token || !deviceId) {
    return false;
  }

  return await withLock(async () => {
    const nowMs = resolveNow(params.nowMs);
    const state = await loadState(params.baseDir);
    const pruned = pruneExpiredTokens(state, nowMs);
    const tokenHash = hashBootstrapToken(token);
    const entry = state[tokenHash];
    if (!entry) {
      if (pruned) {
        await persistState(state, params.baseDir);
      }
      return false;
    }
    if (entry.expiresAtMs <= nowMs) {
      delete state[tokenHash];
      await persistState(state, params.baseDir);
      return false;
    }
    if (entry.boundDeviceId && entry.boundDeviceId !== deviceId) {
      if (pruned) {
        await persistState(state, params.baseDir);
      }
      return false;
    }
    delete state[tokenHash];
    await persistState(state, params.baseDir);
    return true;
  });
}
