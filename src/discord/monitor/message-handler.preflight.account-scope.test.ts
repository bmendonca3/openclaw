import { ChannelType } from "@buape/carbon";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { preflightDiscordMessage } from "./message-handler.preflight.js";
import type { DiscordMessagePreflightParams } from "./message-handler.preflight.types.js";

const readChannelAllowFromStoreMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
const upsertChannelPairingRequestMock = vi.hoisted(() =>
  vi.fn(async () => ({ code: "PAIRCODE", created: false })),
);

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: readChannelAllowFromStoreMock,
  upsertChannelPairingRequest: upsertChannelPairingRequestMock,
}));

describe("discord preflight pairing account scope", () => {
  it("scopes DM pairing-store reads and writes to accountId", async () => {
    const author = {
      id: "attacker-1",
      username: "attacker",
      bot: false,
    };
    const message = {
      id: "m-1",
      content: "hello",
      timestamp: new Date().toISOString(),
      channelId: "dm-1",
      attachments: [],
      mentionedUsers: [],
      mentionedRoles: [],
      mentionedEveryone: false,
      author,
    };
    const client = {
      fetchChannel: vi.fn(async () => ({
        id: "dm-1",
        type: ChannelType.DM,
      })),
    };

    const result = await preflightDiscordMessage({
      cfg: {
        session: {
          mainKey: "main",
          scope: "per-sender",
        },
      } as OpenClawConfig,
      discordConfig: {
        dmPolicy: "pairing",
        allowFrom: [],
      } as NonNullable<OpenClawConfig["channels"]>["discord"],
      accountId: "work",
      token: "token",
      runtime: {} as DiscordMessagePreflightParams["runtime"],
      botUserId: "bot-1",
      guildHistories: new Map(),
      historyLimit: 0,
      mediaMaxBytes: 1024 * 1024,
      textLimit: 2000,
      replyToMode: "off",
      dmEnabled: true,
      groupDmEnabled: false,
      ackReactionScope: "direct",
      groupPolicy: "allowlist",
      threadBindings: {
        getByThreadId: () => undefined,
      } as unknown as DiscordMessagePreflightParams["threadBindings"],
      data: {
        channel_id: "dm-1",
        author,
        message,
      } as DiscordMessagePreflightParams["data"],
      client: client as unknown as DiscordMessagePreflightParams["client"],
    });

    expect(result).toBeNull();
    expect(readChannelAllowFromStoreMock).toHaveBeenCalledWith(
      "discord",
      expect.any(Object),
      "work",
    );
    expect(upsertChannelPairingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "discord",
        id: "attacker-1",
        accountId: "work",
      }),
    );
  });
});
