import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("config: tools.allowMode", () => {
  it("accepts strict and compat", () => {
    const strictRes = validateConfigObject({
      tools: {
        allowMode: "strict",
      },
    });
    expect(strictRes.ok).toBe(true);

    const compatRes = validateConfigObject({
      tools: {
        allowMode: "compat",
      },
    });
    expect(compatRes.ok).toBe(true);
  });

  it("rejects unknown allowMode values", () => {
    const res = validateConfigObject({
      tools: {
        allowMode: "legacy",
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path === "tools.allowMode")).toBe(true);
    }
  });
});
