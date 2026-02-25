import { ChannelType } from "@buape/carbon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeCommandSpec } from "../../auto-reply/commands-registry.js";
import type { OpenClawConfig } from "../../config/config.js";
import { createDiscordNativeCommand } from "./native-command.js";
import { createNoopThreadBindingManager } from "./thread-bindings.js";

const readAllowFromStoreMock = vi.hoisted(() => vi.fn());
const upsertPairingRequestMock = vi.hoisted(() => vi.fn());

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));

describe("createDiscordNativeCommand account-scoped DM pairing", () => {
  beforeEach(() => {
    readAllowFromStoreMock.mockClear().mockResolvedValue([]);
    upsertPairingRequestMock.mockClear().mockResolvedValue({ code: "PAIRCODE", created: true });
  });

  it("passes accountId to pairing-store read/upsert in DM pairing mode", async () => {
    const command = createDiscordNativeCommand({
      command: {
        key: "status",
        name: "status",
        description: "status",
        acceptsArgs: false,
      } as unknown as NativeCommandSpec,
      cfg: {
        channels: {
          discord: {
            dmPolicy: "pairing",
            allowFrom: [],
          },
        },
      } as OpenClawConfig,
      discordConfig: {
        dmPolicy: "pairing",
        allowFrom: [],
      } as NonNullable<OpenClawConfig["channels"]>["discord"],
      accountId: "work",
      sessionPrefix: "discord:slash",
      ephemeralDefault: true,
      threadBindings: createNoopThreadBindingManager("work"),
    });

    const reply = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      user: {
        id: "123456789",
        username: "attacker",
        discriminator: "1111",
      },
      channel: {
        id: "dm-1",
        type: ChannelType.DM,
      },
      guild: null,
      rawData: { id: "interaction-1", member: { roles: [] } },
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
      reply,
      followUp,
      client: { rest: {} },
    } as unknown as import("@buape/carbon").CommandInteraction;

    await command.run(interaction);

    expect(readAllowFromStoreMock).toHaveBeenCalledWith("discord", process.env, "work");
    expect(upsertPairingRequestMock).toHaveBeenCalledWith({
      channel: "discord",
      id: "123456789",
      accountId: "work",
      meta: {
        tag: "attacker#1111",
        name: "attacker",
      },
    });
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
      }),
    );
  });
});
