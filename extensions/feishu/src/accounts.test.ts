import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { describe, expect, it } from "vitest";
import { resolveDefaultFeishuAccountId } from "./accounts.js";

describe("resolveDefaultFeishuAccountId", () => {
  it("prefers channels.feishu.defaultAccount over alphabetical fallback", () => {
    const cfg = {
      channels: {
        feishu: {
          defaultAccount: "main",
          accounts: {
            alpha: {
              appId: "cli_alpha",
              appSecret: "secret_alpha",
            },
            main: {
              appId: "cli_main",
              appSecret: "secret_main",
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(resolveDefaultFeishuAccountId(cfg)).toBe("main");
  });
});
