import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("install integrity gate config fields", () => {
  it("accepts plugins.requireInstallIntegrity", () => {
    const res = validateConfigObject({
      plugins: {
        requireInstallIntegrity: true,
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.plugins?.requireInstallIntegrity).toBe(true);
    }
  });

  it("accepts hooks.internal.requireInstallIntegrity", () => {
    const res = validateConfigObject({
      hooks: {
        internal: {
          enabled: true,
          requireInstallIntegrity: true,
        },
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.hooks?.internal?.requireInstallIntegrity).toBe(true);
    }
  });
});
