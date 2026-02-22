import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("config: skills.trustedPublishers", () => {
  it("accepts string array values", () => {
    const res = validateConfigObject({
      skills: {
        trustedPublishers: ["publisher-a", "key-id-1"],
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects non-array values", () => {
    const res = validateConfigObject({
      skills: {
        trustedPublishers: "publisher-a",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "skills.trustedPublishers")).toBe(true);
    }
  });
});
