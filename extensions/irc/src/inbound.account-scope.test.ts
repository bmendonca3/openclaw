import type { PluginRuntime, RuntimeEnv } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedIrcAccount } from "./accounts.js";
import { handleIrcInbound } from "./inbound.js";
import { setIrcRuntime } from "./runtime.js";
import type { CoreConfig, IrcInboundMessage } from "./types.js";

describe("irc inbound pairing account scoping", () => {
  it("scopes pairing-store reads and pairing requests to the active account", async () => {
    const readAllowFromStore = vi.fn(
      async (_channel: string, _env?: NodeJS.ProcessEnv, accountId?: string) =>
        accountId === "beta" ? [] : ["attacker!u@h"],
    );
    const upsertPairingRequest = vi.fn(async () => ({ code: "PAIRME77", created: true }));
    const buildPairingReply = vi.fn(() => "pairing reply");

    setIrcRuntime({
      channel: {
        pairing: {
          readAllowFromStore,
          upsertPairingRequest,
          buildPairingReply,
        },
        commands: {
          shouldHandleTextCommands: vi.fn(() => true),
        },
        text: {
          hasControlCommand: vi.fn(() => false),
        },
      },
    } as unknown as PluginRuntime);

    const account: ResolvedIrcAccount = {
      accountId: "beta",
      enabled: true,
      configured: true,
      host: "irc.example",
      port: 6697,
      tls: true,
      nick: "openclaw",
      username: "openclaw",
      realname: "OpenClaw",
      password: "",
      passwordSource: "none",
      config: {
        dmPolicy: "pairing",
        allowFrom: [],
      },
    };

    const config: CoreConfig = {
      channels: {
        irc: {
          accounts: {
            alpha: {
              dmPolicy: "pairing",
              allowFrom: [],
            },
            beta: {
              dmPolicy: "pairing",
              allowFrom: [],
            },
          },
        },
      },
    };

    const message: IrcInboundMessage = {
      messageId: "msg-1",
      target: "attacker",
      rawTarget: "openclaw",
      senderNick: "attacker",
      senderUser: "u",
      senderHost: "h",
      text: "hello",
      timestamp: Date.now(),
      isGroup: false,
    };

    const sendReply = vi.fn(async () => {});
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: ((code: number): never => {
        throw new Error(`exit ${code}`);
      }) as RuntimeEnv["exit"],
    };

    await handleIrcInbound({
      message,
      account,
      config,
      runtime,
      sendReply,
    });

    expect(readAllowFromStore).toHaveBeenCalledWith("irc", undefined, "beta");
    expect(upsertPairingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "irc",
        id: "attacker!u@h",
        accountId: "beta",
      }),
    );
    expect(sendReply).toHaveBeenCalled();
  });
});
