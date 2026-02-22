import { describe, expect, it } from "vitest";
import { resolveSkillCapabilities, resolveSkillInvocationPolicy } from "./frontmatter.js";

describe("resolveSkillInvocationPolicy", () => {
  it("defaults to enabled behaviors", () => {
    const policy = resolveSkillInvocationPolicy({});
    expect(policy.userInvocable).toBe(true);
    expect(policy.disableModelInvocation).toBe(false);
  });

  it("parses frontmatter boolean strings", () => {
    const policy = resolveSkillInvocationPolicy({
      "user-invocable": "no",
      "disable-model-invocation": "yes",
    });
    expect(policy.userInvocable).toBe(false);
    expect(policy.disableModelInvocation).toBe(true);
  });
});

describe("resolveSkillCapabilities", () => {
  it("parses required tools and sandbox flags from frontmatter fields", () => {
    const capabilities = resolveSkillCapabilities({
      "required-tools": "exec, sessions_send",
      "requires-sandbox": "true",
    });
    expect(capabilities).toEqual({
      requiredTools: ["exec", "sessions_send"],
      requiresSandbox: true,
    });
  });

  it("parses capabilities object from metadata openclaw block", () => {
    const capabilities = resolveSkillCapabilities({
      metadata:
        '{"openclaw":{"capabilities":{"requiredTools":["exec","read"],"requiresSandbox":true}}}',
    });
    expect(capabilities).toEqual({
      requiredTools: ["exec", "read"],
      requiresSandbox: true,
    });
  });
});
