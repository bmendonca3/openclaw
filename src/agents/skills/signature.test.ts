import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorkspaceSkillSnapshot } from "../skills.js";
import { buildSkillSignatureManifest, verifySkillSignature } from "./signature.js";

const fsp = fs.promises;

async function makeTempDir(prefix: string): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill(skillDir: string, body: string) {
  await fsp.mkdir(skillDir, { recursive: true });
  await fsp.writeFile(path.join(skillDir, "SKILL.md"), body, "utf8");
}

async function signSkill(skillDir: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const manifest = buildSkillSignatureManifest(skillDir);
  const signature = crypto.sign(null, Buffer.from(manifest, "utf8"), privateKey).toString("base64");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  await fsp.writeFile(
    path.join(skillDir, "skill.sig"),
    JSON.stringify(
      {
        algorithm: "ed25519",
        publicKey: publicKeyPem,
        signature,
        publisher: "test-publisher",
        keyId: "test-key",
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("skills signature verification", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (!dir) {
        continue;
      }
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns unsigned when signature file is absent", async () => {
    const root = await makeTempDir("openclaw-skill-signature-");
    tempDirs.push(root);
    const skillDir = path.join(root, "unsigned");
    await writeSkill(skillDir, "# unsigned\n");

    expect(verifySkillSignature(skillDir)).toEqual({ status: "unsigned" });
  });

  it("verifies a valid ed25519 signature", async () => {
    const root = await makeTempDir("openclaw-skill-signature-");
    tempDirs.push(root);
    const skillDir = path.join(root, "verified");
    await writeSkill(skillDir, "# verified\n");
    await signSkill(skillDir);

    expect(verifySkillSignature(skillDir)).toEqual({
      status: "verified",
      publisher: "test-publisher",
      keyId: "test-key",
    });
  });

  it("marks tampered skills as invalid", async () => {
    const root = await makeTempDir("openclaw-skill-signature-");
    tempDirs.push(root);
    const skillDir = path.join(root, "tampered");
    await writeSkill(skillDir, "# before\n");
    await signSkill(skillDir);
    await fsp.writeFile(path.join(skillDir, "SKILL.md"), "# after\n", "utf8");

    const result = verifySkillSignature(skillDir);
    expect(result.status).toBe("invalid");
  });

  it("quarantines invalid-signature managed skills from prompt snapshot", async () => {
    const workspace = await makeTempDir("openclaw-skill-signature-workspace-");
    tempDirs.push(workspace);
    const managedDir = path.join(workspace, ".managed");
    const skillDir = path.join(managedDir, "tampered");
    await writeSkill(skillDir, "# tampered\n");
    await signSkill(skillDir);
    await fsp.writeFile(path.join(skillDir, "SKILL.md"), "# tampered-modified\n", "utf8");

    const snapshot = buildWorkspaceSkillSnapshot(workspace, {
      managedSkillsDir: managedDir,
      bundledSkillsDir: path.join(workspace, ".bundled-empty"),
    });

    expect(snapshot.skills.some((skill) => skill.name === "tampered")).toBe(false);
  });
});
