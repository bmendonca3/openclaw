import { describe, expect, it } from "vitest";
import { __testing } from "./monitor.js";

describe("mattermost group allowlist policy", () => {
  it("keeps DM allowlist merged with pairing store entries", () => {
    const resolved = __testing.resolveMattermostEffectiveAllowlists({
      configAllowFrom: ["owner"],
      configGroupAllowFrom: [],
      storeAllowFrom: ["paired-user"],
    });

    expect(resolved.effectiveAllowFrom).toEqual(["owner", "paired-user"]);
  });

  it("does not grant group access from pairing-store when explicit groupAllowFrom exists", () => {
    const resolved = __testing.resolveMattermostEffectiveAllowlists({
      configAllowFrom: ["owner"],
      configGroupAllowFrom: ["group-owner"],
      storeAllowFrom: ["paired-user"],
    });

    expect(resolved.effectiveGroupAllowFrom).toEqual(["group-owner"]);
  });

  it("does not grant group access from pairing-store when groupAllowFrom falls back to allowFrom", () => {
    const resolved = __testing.resolveMattermostEffectiveAllowlists({
      configAllowFrom: ["owner"],
      configGroupAllowFrom: [],
      storeAllowFrom: ["paired-user"],
    });

    expect(resolved.effectiveGroupAllowFrom).toEqual(["owner"]);
  });
});
