import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SIGNATURE_FILE = "skill.sig";

type SkillSignatureEnvelope = {
  algorithm?: string;
  publicKey?: string;
  signature?: string;
  publisher?: string;
  keyId?: string;
};

export type SkillSignatureStatus =
  | { status: "unsigned" }
  | { status: "verified"; publisher?: string; keyId?: string }
  | { status: "invalid"; reason: string };

function listFilesRecursive(root: string, current: string, out: string[]) {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(root, abs, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const rel = path.relative(root, abs);
    if (!rel || rel === SIGNATURE_FILE) {
      continue;
    }
    out.push(rel.split(path.sep).join("/"));
  }
}

export function buildSkillSignatureManifest(skillDir: string): string {
  const files: string[] = [];
  listFilesRecursive(skillDir, skillDir, files);
  files.sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const rel of files) {
    const abs = path.join(skillDir, rel.split("/").join(path.sep));
    const content = fs.readFileSync(abs);
    const digest = crypto.createHash("sha256").update(content).digest("hex");
    lines.push(`${rel}\t${digest}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseSignatureEnvelope(raw: string): SkillSignatureEnvelope {
  const parsed = JSON.parse(raw) as SkillSignatureEnvelope;
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function verifySkillSignature(skillDir: string): SkillSignatureStatus {
  const signaturePath = path.join(skillDir, SIGNATURE_FILE);
  if (!fs.existsSync(signaturePath)) {
    return { status: "unsigned" };
  }

  let envelope: SkillSignatureEnvelope;
  try {
    const raw = fs.readFileSync(signaturePath, "utf8");
    envelope = parseSignatureEnvelope(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature payload";
    return { status: "invalid", reason: message };
  }

  const algorithm = (envelope.algorithm ?? "ed25519").trim().toLowerCase();
  if (algorithm !== "ed25519") {
    return { status: "invalid", reason: `unsupported algorithm: ${algorithm || "(empty)"}` };
  }

  const publicKeyPem = typeof envelope.publicKey === "string" ? envelope.publicKey.trim() : "";
  const signatureB64 = typeof envelope.signature === "string" ? envelope.signature.trim() : "";
  if (!publicKeyPem || !signatureB64) {
    return { status: "invalid", reason: "signature payload missing publicKey/signature" };
  }

  try {
    const manifest = buildSkillSignatureManifest(skillDir);
    const signature = Buffer.from(signatureB64, "base64");
    if (signature.length === 0) {
      return { status: "invalid", reason: "empty signature bytes" };
    }
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const ok = crypto.verify(null, Buffer.from(manifest, "utf8"), publicKey, signature);
    if (!ok) {
      return { status: "invalid", reason: "signature verification failed" };
    }
    return {
      status: "verified",
      ...(typeof envelope.publisher === "string" && envelope.publisher.trim()
        ? { publisher: envelope.publisher.trim() }
        : {}),
      ...(typeof envelope.keyId === "string" && envelope.keyId.trim()
        ? { keyId: envelope.keyId.trim() }
        : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "signature verification failed";
    return { status: "invalid", reason: message };
  }
}
