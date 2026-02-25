import { describe, expect, it } from "vitest";
import {
  resolveDiscordMemberAccessState,
  type DiscordChannelConfigResolved,
  type DiscordGuildEntryResolved,
} from "./allow-list.js";

describe("resolveDiscordMemberAccessState explicit empty overrides", () => {
  it("fails closed when channel users override is explicitly empty", () => {
    const channelConfig: DiscordChannelConfigResolved = {
      allowed: true,
      users: [],
    };
    const guildInfo: DiscordGuildEntryResolved = {
      users: ["trusted-user"],
    };

    const result = resolveDiscordMemberAccessState({
      channelConfig,
      guildInfo,
      memberRoleIds: [],
      sender: { id: "attacker-user" },
    });

    expect(result.hasAccessRestrictions).toBe(true);
    expect(result.memberAllowed).toBe(false);
  });

  it("fails closed when channel roles override is explicitly empty", () => {
    const channelConfig: DiscordChannelConfigResolved = {
      allowed: true,
      roles: [],
    };
    const guildInfo: DiscordGuildEntryResolved = {
      roles: ["trusted-role"],
    };

    const result = resolveDiscordMemberAccessState({
      channelConfig,
      guildInfo,
      memberRoleIds: ["untrusted-role"],
      sender: { id: "attacker-user" },
    });

    expect(result.hasAccessRestrictions).toBe(true);
    expect(result.memberAllowed).toBe(false);
  });

  it("keeps inherited restrictions when channel overrides are unset", () => {
    const channelConfig: DiscordChannelConfigResolved = {
      allowed: true,
    };
    const guildInfo: DiscordGuildEntryResolved = {
      users: ["trusted-user"],
    };

    const result = resolveDiscordMemberAccessState({
      channelConfig,
      guildInfo,
      memberRoleIds: [],
      sender: { id: "attacker-user" },
    });

    expect(result.hasAccessRestrictions).toBe(true);
    expect(result.memberAllowed).toBe(false);
  });
});
