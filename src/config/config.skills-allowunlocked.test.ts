import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("config: skills.allowUnlocked", () => {
  it("accepts boolean values", () => {
    expect(
      validateConfigObject({
        skills: {
          allowUnlocked: true,
        },
      }).ok,
    ).toBe(true);

    expect(
      validateConfigObject({
        skills: {
          allowUnlocked: false,
        },
      }).ok,
    ).toBe(true);
  });

  it("rejects non-boolean values", () => {
    const res = validateConfigObject({
      skills: {
        allowUnlocked: "yes",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "skills.allowUnlocked")).toBe(true);
    }
  });
});
