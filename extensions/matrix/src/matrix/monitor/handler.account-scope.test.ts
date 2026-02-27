import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMatrixRoomMessageHandler } from "./handler.js";
import { EventType, type MatrixRawEvent } from "./types.js";

const sendMessageMatrixMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../send.js", () => ({
  sendMessageMatrix: (...args: unknown[]) => sendMessageMatrixMock(...args),
  sendTypingMatrix: vi.fn().mockResolvedValue(undefined),
  reactMatrixMessage: vi.fn().mockResolvedValue(undefined),
}));

describe("matrix handler pairing account scoping", () => {
  beforeEach(() => {
    sendMessageMatrixMock.mockClear();
  });

  it("scopes DM pairing store reads and writes by accountId", async () => {
    const readAllowFromStore = vi.fn().mockResolvedValue([]);
    const upsertPairingRequest = vi.fn().mockResolvedValue({ code: "PAIRCODE", created: false });
    const core = {
      channel: {
        pairing: {
          readAllowFromStore,
          upsertPairingRequest,
          buildPairingReply: vi.fn(() => "Pairing code: PAIRCODE"),
        },
      },
      logging: {
        shouldLogVerbose: vi.fn(() => false),
      },
    } as unknown as PluginRuntime;

    const handler = createMatrixRoomMessageHandler({
      client: {
        getUserId: vi.fn().mockResolvedValue("@bot:example.org"),
      } as unknown as MatrixClient,
      core,
      cfg: {},
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      logVerboseMessage: vi.fn(),
      allowFrom: [],
      roomsConfig: undefined,
      mentionRegexes: [],
      groupPolicy: "allowlist",
      replyToMode: "off",
      threadReplies: "off",
      dmEnabled: true,
      dmPolicy: "pairing",
      textLimit: 4000,
      mediaMaxBytes: 20 * 1024 * 1024,
      startupMs: Date.now(),
      startupGraceMs: 60_000,
      directTracker: {
        isDirectMessage: vi.fn().mockResolvedValue(true),
      },
      getRoomInfo: vi.fn().mockResolvedValue({
        name: "DM Room",
        canonicalAlias: undefined,
        altAliases: [],
      }),
      getMemberDisplayName: vi.fn().mockResolvedValue("Alice"),
      accountId: "work",
    });

    const event = {
      type: EventType.RoomMessage,
      event_id: "$event-1",
      sender: "@alice:example.org",
      origin_server_ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "hello",
      },
    } as MatrixRawEvent;

    await handler("!dm:example.org", event);

    expect(readAllowFromStore).toHaveBeenCalledWith({
      channel: "matrix",
      accountId: "work",
    });
    expect(upsertPairingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "matrix",
        id: "@alice:example.org",
        accountId: "work",
      }),
    );
  });
});
