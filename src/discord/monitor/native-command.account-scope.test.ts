import { ChannelType, type CommandInteraction } from "@buape/carbon";
import { describe, expect, it, vi } from "vitest";
import type { NativeCommandSpec } from "../../auto-reply/commands-registry.types.js";
import type { OpenClawConfig } from "../../config/config.js";
import { createDiscordNativeCommand } from "./native-command.js";
import type { ThreadBindingManager } from "./thread-bindings.js";

const readChannelAllowFromStoreMock = vi.hoisted(() => vi.fn(async () => [] as string[]));
const upsertChannelPairingRequestMock = vi.hoisted(() =>
  vi.fn(async () => ({ code: "PAIRCODE", created: false })),
);

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: readChannelAllowFromStoreMock,
  upsertChannelPairingRequest: upsertChannelPairingRequestMock,
}));

describe("discord native command pairing account scope", () => {
  it("scopes DM pairing-store reads and writes to accountId", async () => {
    const command = createDiscordNativeCommand({
      command: {
        name: "test-native",
        description: "test",
        acceptsArgs: false,
      } satisfies NativeCommandSpec,
      cfg: {} as ReturnType<typeof import("../../config/config.js").loadConfig>,
      discordConfig: {
        dmPolicy: "pairing",
        allowFrom: [],
      } as NonNullable<OpenClawConfig["channels"]>["discord"],
      accountId: "work",
      sessionPrefix: "discord:slash",
      ephemeralDefault: true,
      threadBindings: {} as ThreadBindingManager,
    });

    const interaction = {
      user: {
        id: "attacker-1",
        username: "attacker",
        bot: false,
      },
      channel: {
        id: "dm-1",
        type: ChannelType.DM,
      },
      guild: null,
      rawData: {},
      options: {
        getString: () => null,
      },
      reply: vi.fn(async () => undefined),
      followUp: vi.fn(async () => undefined),
      client: {},
    } as unknown as CommandInteraction;

    await command.run(interaction);

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
