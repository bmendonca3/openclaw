import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Skill } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { resolveManagedSkillIntegrity } from "./integrity.js";

async function makeManagedSkill(params: {
  managedDir: string;
  name: string;
  body: string;
}): Promise<Skill> {
  const skillDir = path.join(params.managedDir, params.name);
  await fs.mkdir(skillDir, { recursive: true });
  const filePath = path.join(skillDir, "SKILL.md");
  await fs.writeFile(
    filePath,
    `---\nname: ${params.name}\ndescription: ${params.name}\n---\n\n${params.body}\n`,
    "utf8",
  );
  return {
    name: params.name,
    description: params.name,
    filePath,
    baseDir: skillDir,
    source: "openclaw-managed",
  } as Skill;
}

describe("skills integrity lock", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (!dir) {
        continue;
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("marks managed skills as missing lock entries when skills.lock is absent", async () => {
    const managedDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-managed-lock-"));
    tempDirs.push(managedDir);
    const skill = await makeManagedSkill({
      managedDir,
      name: "alpha",
      body: "# alpha",
    });

    const integrity = resolveManagedSkillIntegrity({
      managedSkillsDir: managedDir,
      skills: [skill],
      allowUnlocked: false,
    });
    const entry = integrity.get("alpha");
    expect(entry?.missingLock).toBe(true);
    expect(entry?.mismatch).toBe(false);
  });

  it("creates skills.lock baseline when allowUnlocked is enabled", async () => {
    const managedDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-managed-lock-"));
    tempDirs.push(managedDir);
    const skill = await makeManagedSkill({
      managedDir,
      name: "beta",
      body: "# beta",
    });

    resolveManagedSkillIntegrity({
      managedSkillsDir: managedDir,
      skills: [skill],
      allowUnlocked: true,
    });

    const second = resolveManagedSkillIntegrity({
      managedSkillsDir: managedDir,
      skills: [skill],
      allowUnlocked: false,
    });
    const entry = second.get("beta");
    expect(entry?.missingLock).toBe(false);
    expect(entry?.mismatch).toBe(false);
  });

  it("detects lock drift after managed skill content changes", async () => {
    const managedDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-managed-lock-"));
    tempDirs.push(managedDir);
    const skill = await makeManagedSkill({
      managedDir,
      name: "gamma",
      body: "# gamma v1",
    });

    resolveManagedSkillIntegrity({
      managedSkillsDir: managedDir,
      skills: [skill],
      allowUnlocked: true,
    });

    await fs.writeFile(
      path.join(skill.baseDir, "SKILL.md"),
      `---\nname: gamma\ndescription: gamma\n---\n\n# gamma v2\n`,
      "utf8",
    );

    const drifted = resolveManagedSkillIntegrity({
      managedSkillsDir: managedDir,
      skills: [skill],
      allowUnlocked: false,
    });
    const entry = drifted.get("gamma");
    expect(entry?.missingLock).toBe(false);
    expect(entry?.mismatch).toBe(true);
  });
});
