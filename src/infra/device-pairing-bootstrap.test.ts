import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  consumeDevicePairingBootstrapToken,
  createDevicePairingBootstrapToken,
  DEVICE_PAIRING_BOOTSTRAP_TTL_MS,
  verifyDevicePairingBootstrapToken,
} from "./device-pairing-bootstrap.js";

describe("device pairing bootstrap token", () => {
  test("binds token to first device and invalidates after consume", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "openclaw-device-bootstrap-"));
    const issued = await createDevicePairingBootstrapToken({ baseDir, nowMs: 1_000 });

    const firstUse = await verifyDevicePairingBootstrapToken({
      baseDir,
      token: issued.token,
      deviceId: "device-a",
      nowMs: 1_100,
    });
    expect(firstUse).toEqual({
      ok: true,
      expiresAtMs: issued.expiresAtMs,
      boundDeviceId: "device-a",
    });

    const secondDevice = await verifyDevicePairingBootstrapToken({
      baseDir,
      token: issued.token,
      deviceId: "device-b",
      nowMs: 1_200,
    });
    expect(secondDevice).toEqual({ ok: false, reason: "device-mismatch" });

    await expect(
      consumeDevicePairingBootstrapToken({
        baseDir,
        token: issued.token,
        deviceId: "device-a",
        nowMs: 1_300,
      }),
    ).resolves.toBe(true);

    const reused = await verifyDevicePairingBootstrapToken({
      baseDir,
      token: issued.token,
      deviceId: "device-a",
      nowMs: 1_400,
    });
    expect(reused).toEqual({ ok: false, reason: "invalid-token" });
  });

  test("rejects expired bootstrap tokens", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "openclaw-device-bootstrap-"));
    const issued = await createDevicePairingBootstrapToken({
      baseDir,
      nowMs: 10_000,
      ttlMs: 1_000,
    });

    const expired = await verifyDevicePairingBootstrapToken({
      baseDir,
      token: issued.token,
      deviceId: "device-a",
      nowMs: 11_500,
    });
    expect(expired).toEqual({ ok: false, reason: "invalid-token" });
  });

  test("uses default ttl when ttl is omitted", async () => {
    const issued = await createDevicePairingBootstrapToken({ nowMs: 20_000 });
    expect(issued.expiresAtMs).toBe(20_000 + DEVICE_PAIRING_BOOTSTRAP_TTL_MS);
  });
});
