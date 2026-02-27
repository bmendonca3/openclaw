import type { PluginRuntime, RuntimeEnv } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedNextcloudTalkAccount } from "./accounts.js";
import { handleNextcloudTalkInbound } from "./inbound.js";
import { setNextcloudTalkRuntime } from "./runtime.js";
import type { CoreConfig, NextcloudTalkInboundMessage } from "./types.js";

describe("nextcloud-talk pairing account scope", () => {
  it("uses account-scoped pairing reads/writes for DM authorization", async () => {
    const readAllowFromStore = vi.fn(async () => []);
    const upsertPairingRequest = vi.fn(async () => ({ code: "PAIR42", created: false }));

    setNextcloudTalkRuntime({
      channel: {
        pairing: {
          readAllowFromStore,
          upsertPairingRequest,
        },
        commands: {
          shouldHandleTextCommands: () => false,
        },
        text: {
          hasControlCommand: () => false,
        },
      },
    } as unknown as PluginRuntime);

    const message: NextcloudTalkInboundMessage = {
      messageId: "m-1",
      roomToken: "room-1",
      roomName: "Direct",
      senderId: "alice",
      senderName: "Alice",
      text: "hello",
      mediaType: "text/plain",
      timestamp: Date.now(),
      isGroupChat: false,
    };

    const account: ResolvedNextcloudTalkAccount = {
      accountId: "work",
      enabled: true,
      baseUrl: "",
      secret: "",
      secretSource: "none",
      config: {
        dmPolicy: "pairing",
        allowFrom: [],
        groupPolicy: "allowlist",
        groupAllowFrom: [],
      },
    };

    const config: CoreConfig = {
      channels: {
        "nextcloud-talk": {
          dmPolicy: "pairing",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
        },
      },
    };

    await handleNextcloudTalkInbound({
      message,
      account,
      config,
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
      } as unknown as RuntimeEnv,
    });

    expect(readAllowFromStore).toHaveBeenCalledWith({
      channel: "nextcloud-talk",
      accountId: "work",
    });
    expect(upsertPairingRequest).toHaveBeenCalledWith({
      channel: "nextcloud-talk",
      id: "alice",
      accountId: "work",
      meta: { name: "Alice" },
    });
  });
});
