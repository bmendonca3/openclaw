import fs from "node:fs/promises";
import path from "node:path";
import { formatCliCommand } from "../cli/command-format.js";
import { resolveConfigPath, resolveOAuthDir, resolveStateDir } from "../config/paths.js";
import {
  formatPermissionDetail,
  formatPermissionRemediation,
  inspectPathPermissions,
  type PermissionCheck,
} from "../security/audit-fs.js";
import { shortenHomePath } from "../utils.js";

type StartupPermissionIssue = {
  targetPath: string;
  reason: string;
  detail: string;
  remediation?: string;
};

type StartupPermissionTarget = {
  path: string;
  isDir: boolean;
  label: string;
  expectedMode: number;
};

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectCredentialTargets(
  credsDir: string,
): Promise<Array<{ path: string; isDir: boolean }>> {
  const found: Array<{ path: string; isDir: boolean }> = [{ path: credsDir, isDir: true }];
  const stack: string[] = [credsDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        found.push({ path: nextPath, isDir: true });
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile()) {
        found.push({ path: nextPath, isDir: false });
        continue;
      }
      if (entry.isSymbolicLink()) {
        try {
          const stat = await fs.stat(nextPath);
          found.push({ path: nextPath, isDir: stat.isDirectory() });
        } catch {
          found.push({ path: nextPath, isDir: false });
        }
      }
    }
  }
  return found;
}

function describeExposure(perms: PermissionCheck): string {
  const exposure: string[] = [];
  if (perms.worldReadable) {
    exposure.push("world-readable");
  }
  if (perms.groupReadable) {
    exposure.push("group-readable");
  }
  if (perms.worldWritable) {
    exposure.push("world-writable");
  }
  if (perms.groupWritable) {
    exposure.push("group-writable");
  }
  return exposure.join(", ");
}

function isUnsafe(perms: PermissionCheck): boolean {
  return perms.groupReadable || perms.worldReadable || perms.groupWritable || perms.worldWritable;
}

async function evaluateTarget(params: {
  target: StartupPermissionTarget;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}): Promise<StartupPermissionIssue | null> {
  const perms = await inspectPathPermissions(params.target.path, {
    env: params.env,
    platform: params.platform,
  });
  if (!perms.ok) {
    return {
      targetPath: params.target.path,
      reason: `could not inspect permissions (${perms.error ?? "unknown error"})`,
      detail: `${shortenHomePath(params.target.path)} permission check failed`,
    };
  }
  if (!isUnsafe(perms)) {
    return null;
  }
  const detail = formatPermissionDetail(shortenHomePath(params.target.path), perms);
  const remediation = formatPermissionRemediation({
    targetPath: params.target.path,
    perms,
    isDir: params.target.isDir,
    posixMode: params.target.expectedMode,
    env: params.env,
  });
  return {
    targetPath: params.target.path,
    reason: `${params.target.label} is ${describeExposure(perms)}`,
    detail,
    remediation,
  };
}

export async function assertGatewayStartupPermissionSafety(opts?: {
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  configPath?: string;
  platform?: NodeJS.Platform;
}): Promise<void> {
  const env = opts?.env ?? process.env;
  const platform = opts?.platform ?? process.platform;
  const stateDir = opts?.stateDir ?? resolveStateDir(env);
  const configPath = opts?.configPath ?? resolveConfigPath(env, stateDir);
  const dotenvPath = path.join(stateDir, ".env");
  const credentialsDir = resolveOAuthDir(env, stateDir);

  const targets: StartupPermissionTarget[] = [
    { path: stateDir, isDir: true, label: "state directory", expectedMode: 0o700 },
    { path: configPath, isDir: false, label: "config file", expectedMode: 0o600 },
    { path: dotenvPath, isDir: false, label: "dotenv file", expectedMode: 0o600 },
  ];

  if (await exists(credentialsDir)) {
    const credentialTargets = await collectCredentialTargets(credentialsDir);
    for (const credentialTarget of credentialTargets) {
      targets.push({
        path: credentialTarget.path,
        isDir: credentialTarget.isDir,
        label: credentialTarget.isDir ? "credentials directory" : "credentials file",
        expectedMode: credentialTarget.isDir ? 0o700 : 0o600,
      });
    }
  }

  const issues: StartupPermissionIssue[] = [];
  for (const target of targets) {
    if (!(await exists(target.path))) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const issue = await evaluateTarget({ target, env, platform });
    if (issue) {
      issues.push(issue);
    }
  }

  if (issues.length === 0) {
    return;
  }

  const lines: string[] = [
    "Refusing to start gateway: insecure permissions detected in OpenClaw state files.",
    ...issues.map((issue) => {
      const fix = issue.remediation ? ` Fix: ${issue.remediation}` : "";
      return `- ${issue.reason}: ${issue.detail}.${fix}`;
    }),
    `Run "${formatCliCommand("openclaw doctor --fix")}" and retry startup.`,
  ];
  throw new Error(lines.join("\n"));
}
