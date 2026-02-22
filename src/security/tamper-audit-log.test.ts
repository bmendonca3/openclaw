import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendTamperAuditEvent, verifyTamperAuditLog } from "./tamper-audit-log.js";

async function createTempAuditPath(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(dir, "tool-audit.jsonl");
}

describe("tamper-audit-log", () => {
  const tempPaths: string[] = [];

  afterEach(async () => {
    for (const filePath of tempPaths) {
      await fs.rm(path.dirname(filePath), { recursive: true, force: true });
    }
    tempPaths.length = 0;
  });

  it("writes hash-chained entries and verifies successfully", async () => {
    const filePath = await createTempAuditPath("openclaw-audit-");
    tempPaths.push(filePath);

    const first = await appendTamperAuditEvent({
      filePath,
      type: "exec.approval.resolve",
      payload: { id: "a1", decision: "allow-once" },
      ts: 100,
    });
    const second = await appendTamperAuditEvent({
      filePath,
      type: "exec.approval.resolve",
      payload: { id: "a2", decision: "deny" },
      ts: 200,
    });

    expect(first.prevHash).toBeNull();
    expect(second.prevHash).toBe(first.hash);

    const verifyResult = await verifyTamperAuditLog({ filePath });
    expect(verifyResult).toEqual({
      ok: true,
      filePath,
      count: 2,
      lastHash: second.hash,
    });
  });

  it("fails verification when a line is modified", async () => {
    const filePath = await createTempAuditPath("openclaw-audit-");
    tempPaths.push(filePath);

    await appendTamperAuditEvent({
      filePath,
      type: "exec.approval.resolve",
      payload: { id: "a1", decision: "allow-once" },
      ts: 100,
    });
    await appendTamperAuditEvent({
      filePath,
      type: "exec.approval.resolve",
      payload: { id: "a2", decision: "deny" },
      ts: 200,
    });

    const original = await fs.readFile(filePath, "utf-8");
    const tampered = original.replace('"decision":"deny"', '"decision":"allow-always"');
    await fs.writeFile(filePath, tampered, "utf-8");

    const verifyResult = await verifyTamperAuditLog({ filePath });
    expect(verifyResult.ok).toBe(false);
    if (verifyResult.ok) {
      throw new Error("expected failed verification");
    }
    expect(verifyResult.line).toBe(2);
    expect(verifyResult.error).toContain("hash mismatch");
  });
});
