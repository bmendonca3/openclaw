import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { describe, expect, it } from "vitest";
import { listGoogleChatAccountIds, resolveGoogleChatAccount } from "./accounts.js";

describe("googlechat accounts null-safety", () => {
  it("does not throw when channels.googlechat is null", () => {
    const originalServiceAccount = process.env["GOOGLE_CHAT_SERVICE_ACCOUNT"];
    const originalServiceAccountFile = process.env["GOOGLE_CHAT_SERVICE_ACCOUNT_FILE"];
    delete process.env["GOOGLE_CHAT_SERVICE_ACCOUNT"];
    delete process.env["GOOGLE_CHAT_SERVICE_ACCOUNT_FILE"];

    const cfg = {
      channels: {
        googlechat: null,
      },
    } as unknown as OpenClawConfig;

    try {
      expect(listGoogleChatAccountIds(cfg)).toEqual([DEFAULT_ACCOUNT_ID]);
      expect(() => resolveGoogleChatAccount({ cfg })).not.toThrow();

      const account = resolveGoogleChatAccount({ cfg });
      expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
      expect(account.credentialSource).toBe("none");
      expect(Object.keys(account.config)).toEqual([]);
    } finally {
      if (originalServiceAccount === undefined) {
        delete process.env["GOOGLE_CHAT_SERVICE_ACCOUNT"];
      } else {
        process.env["GOOGLE_CHAT_SERVICE_ACCOUNT"] = originalServiceAccount;
      }
      if (originalServiceAccountFile === undefined) {
        delete process.env["GOOGLE_CHAT_SERVICE_ACCOUNT_FILE"];
      } else {
        process.env["GOOGLE_CHAT_SERVICE_ACCOUNT_FILE"] = originalServiceAccountFile;
      }
    }
  });

  it("ignores malformed primitive channels.googlechat values", () => {
    const cfg = {
      channels: {
        googlechat: "enabled",
      },
    } as unknown as OpenClawConfig;

    expect(listGoogleChatAccountIds(cfg)).toEqual([DEFAULT_ACCOUNT_ID]);
    expect(() => resolveGoogleChatAccount({ cfg })).not.toThrow();

    const account = resolveGoogleChatAccount({ cfg });
    expect(account.accountId).toBe(DEFAULT_ACCOUNT_ID);
    expect(account.credentialSource).toBe("none");
    expect(Object.keys(account.config)).toEqual([]);
  });
});
