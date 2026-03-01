import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setMattermostRuntime } from "../runtime.js";
import type { MattermostWebSocketLike } from "./monitor-websocket.js";
import { monitorMattermostProvider } from "./monitor.js";

const createMattermostClientMock = vi.hoisted(() =>
  vi.fn(() => ({
    token: "bot-token",
    apiBaseUrl: "https://mm.example/api/v4",
  })),
);
const fetchMattermostMeMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "bot-user", username: "bot" })),
);
const fetchMattermostChannelMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "chan-dm", type: "D", display_name: "DM" })),
);
const fetchMattermostUserMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "attacker", username: "attacker" })),
);
const sendMattermostTypingMock = vi.hoisted(() => vi.fn(async () => {}));
const sendMessageMattermostMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.js")>();
  return {
    ...actual,
    createMattermostClient: createMattermostClientMock,
    fetchMattermostMe: fetchMattermostMeMock,
    fetchMattermostChannel: fetchMattermostChannelMock,
    fetchMattermostUser: fetchMattermostUserMock,
    sendMattermostTyping: sendMattermostTypingMock,
  };
});

vi.mock("./send.js", () => ({
  sendMessageMattermost: sendMessageMattermostMock,
}));

class FakeWebSocket implements MattermostWebSocketLike {
  public readonly sent: string[] = [];
  private openListeners: Array<() => void> = [];
  private messageListeners: Array<(data: Buffer) => void | Promise<void>> = [];
  private closeListeners: Array<(code: number, reason: Buffer) => void> = [];
  private errorListeners: Array<(err: unknown) => void> = [];

  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: Buffer) => void | Promise<void>): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (err: unknown) => void): void;
  on(event: "open" | "message" | "close" | "error", listener: unknown): void {
    if (event === "open") {
      this.openListeners.push(listener as () => void);
      return;
    }
    if (event === "message") {
      this.messageListeners.push(listener as (data: Buffer) => void | Promise<void>);
      return;
    }
    if (event === "close") {
      this.closeListeners.push(listener as (code: number, reason: Buffer) => void);
      return;
    }
    this.errorListeners.push(listener as (err: unknown) => void);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  terminate(): void {}

  emitOpen(): void {
    for (const listener of this.openListeners) {
      listener();
    }
  }

  async emitMessage(data: Buffer): Promise<void> {
    for (const listener of this.messageListeners) {
      await listener(data);
    }
  }

  emitClose(code: number, reason = ""): void {
    const buffer = Buffer.from(reason, "utf8");
    for (const listener of this.closeListeners) {
      listener(code, buffer);
    }
  }

  emitError(err: unknown): void {
    for (const listener of this.errorListeners) {
      listener(err);
    }
  }
}

const testRuntime = (): RuntimeEnv =>
  ({
    log: vi.fn(),
    error: vi.fn(),
    exit: ((code: number): never => {
      throw new Error(`exit ${code}`);
    }) as RuntimeEnv["exit"],
  }) as RuntimeEnv;

describe("mattermost pairing store account scoping", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not authorize DM sender from another account's pairing-store entry", async () => {
    const readAllowFromStore = vi.fn(
      async (
        channelOrParams:
          | string
          | {
              channel?: string;
              accountId?: string;
            },
        _env?: NodeJS.ProcessEnv,
        accountId?: string,
      ) => {
        const scopedAccountId =
          typeof channelOrParams === "object" && channelOrParams !== null
            ? channelOrParams.accountId
            : accountId;
        return scopedAccountId === "beta" ? [] : ["attacker"];
      },
    );
    const upsertPairingRequest = vi.fn(async () => ({ code: "PAIRME99", created: true }));

    const cfg = {
      channels: {
        mattermost: {
          accounts: {
            alpha: {
              enabled: true,
              botToken: "alpha-token",
              baseUrl: "https://mm.example",
              dmPolicy: "pairing",
              allowFrom: [],
            },
            beta: {
              enabled: true,
              botToken: "beta-token",
              baseUrl: "https://mm.example",
              dmPolicy: "pairing",
              allowFrom: [],
            },
          },
        },
      },
      messages: {
        groupChat: {
          historyLimit: 0,
        },
      },
    };

    setMattermostRuntime({
      config: {
        loadConfig: () => cfg,
      },
      logging: {
        getChildLogger: () => ({ debug: vi.fn() }),
        shouldLogVerbose: () => false,
      },
      channel: {
        pairing: {
          readAllowFromStore,
          upsertPairingRequest,
          buildPairingReply: vi.fn(() => "pairing"),
        },
        commands: {
          shouldHandleTextCommands: vi.fn(() => true),
        },
        text: {
          hasControlCommand: vi.fn(() => false),
        },
        mentions: {
          buildMentionRegexes: vi.fn(() => []),
          matchesMentionPatterns: vi.fn(() => false),
        },
        groups: {
          resolveRequireMention: vi.fn(() => false),
        },
        media: {
          fetchRemoteMedia: vi.fn(),
          saveMediaBuffer: vi.fn(),
        },
        routing: {
          resolveAgentRoute: vi.fn(() => ({
            sessionKey: "session:mattermost:beta",
            mainSessionKey: "session:mattermost:beta",
            agentId: "default",
            accountId: "beta",
          })),
        },
        debounce: {
          resolveInboundDebounceMs: vi.fn(() => 0),
          createInboundDebouncer: vi.fn(({ onFlush }) => ({
            enqueue: async (entry: { post: unknown; payload: unknown }) => {
              await onFlush([entry]);
            },
          })),
        },
        activity: {
          record: vi.fn(),
        },
      },
      system: {
        enqueueSystemEvent: vi.fn(),
      },
      media: {
        mediaKindFromMime: vi.fn(() => "document"),
      },
      dispatchInbound: vi.fn(),
    } as unknown as Parameters<typeof setMattermostRuntime>[0]);

    const socket = new FakeWebSocket();
    const abort = new AbortController();

    const run = monitorMattermostProvider({
      config: cfg as OpenClawConfig,
      accountId: "beta",
      runtime: testRuntime(),
      abortSignal: abort.signal,
      statusSink: (patch) => {
        if (patch.connected === false) {
          abort.abort();
        }
      },
      webSocketFactory: () => socket,
    });

    queueMicrotask(() => {
      void (async () => {
        socket.emitOpen();
        await socket.emitMessage(
          Buffer.from(
            JSON.stringify({
              event: "posted",
              data: {
                post: JSON.stringify({
                  id: "post-1",
                  channel_id: "chan-dm",
                  user_id: "attacker",
                  message: "",
                }),
                channel_id: "chan-dm",
                channel_type: "D",
                sender_name: "attacker",
              },
              broadcast: {
                channel_id: "chan-dm",
                user_id: "attacker",
              },
            }),
          ),
        );
        socket.emitClose(1000, "done");
      })();
    });

    await run;

    expect(readAllowFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "mattermost",
        accountId: "beta",
      }),
    );
    expect(upsertPairingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "mattermost",
        id: "attacker",
        accountId: "beta",
      }),
    );
    expect(sendMessageMattermostMock).toHaveBeenCalled();
  });
});
