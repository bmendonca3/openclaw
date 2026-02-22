import { describe, expect, it } from "vitest";
import { shouldIncludeSkill } from "./config.js";
import type { SkillEntry } from "./types.js";

function makeEntry(params?: Partial<SkillEntry>): SkillEntry {
  return {
    skill: {
      name: "demo-skill",
      description: "demo",
      filePath: "/tmp/demo/SKILL.md",
      baseDir: "/tmp/demo",
      source: "openclaw-managed",
    },
    frontmatter: {},
    metadata: { always: true },
    ...params,
  } as SkillEntry;
}

describe("skills: trusted publishers", () => {
  it("blocks unsigned skills when trustedPublishers is configured", () => {
    const included = shouldIncludeSkill({
      entry: makeEntry({
        signature: { status: "unsigned" },
      }),
      config: {
        skills: {
          trustedPublishers: ["trusted-key"],
        },
      },
    });

    expect(included).toBe(false);
  });

  it("allows verified skills when publisher matches allowlist", () => {
    const included = shouldIncludeSkill({
      entry: makeEntry({
        signature: { status: "verified", publisher: "trusted-publisher" },
      }),
      config: {
        skills: {
          trustedPublishers: ["trusted-publisher"],
        },
      },
    });

    expect(included).toBe(true);
  });

  it("allows verified skills when keyId matches allowlist", () => {
    const included = shouldIncludeSkill({
      entry: makeEntry({
        signature: { status: "verified", keyId: "trusted-key-id" },
      }),
      config: {
        skills: {
          trustedPublishers: ["trusted-key-id"],
        },
      },
    });

    expect(included).toBe(true);
  });

  it("blocks verified skills when neither publisher nor keyId matches", () => {
    const included = shouldIncludeSkill({
      entry: makeEntry({
        signature: { status: "verified", publisher: "publisher-a", keyId: "key-a" },
      }),
      config: {
        skills: {
          trustedPublishers: ["publisher-b", "key-b"],
        },
      },
    });

    expect(included).toBe(false);
  });
});
