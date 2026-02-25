import { beforeEach, describe, expect, it, vi } from "vitest";

const readChannelAllowFromStoreMock = vi.hoisted(() => vi.fn());
const upsertChannelPairingRequestMock = vi.hoisted(() => vi.fn());
const parseIMessageNotificationMock = vi.hoisted(() => vi.fn());
const resolveIMessageInboundDecisionMock = vi.hoisted(() => vi.fn());
const createIMessageRpcClientMock = vi.hoisted(() => vi.fn());

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readChannelAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertChannelPairingRequestMock(...args),
}));

vi.mock("../accounts.js", () => ({
  resolveIMessageAccount: () => ({
    accountId: "work",
    config: {
      dmPolicy: "pairing",
      allowFrom: [],
      groupAllowFrom: [],
      groupPolicy: "open",
    },
  }),
}));

vi.mock("../../infra/transport-ready.js", () => ({
  waitForTransportReady: vi.fn(async () => {}),
}));

vi.mock("../probe.js", () => ({
  probeIMessage: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./abort-handler.js", () => ({
  attachIMessageMonitorAbortHandler: vi.fn(() => () => {}),
}));

vi.mock("./parse-notification.js", () => ({
  parseIMessageNotification: (...args: unknown[]) => parseIMessageNotificationMock(...args),
}));

vi.mock("./inbound-processing.js", () => ({
  resolveIMessageInboundDecision: (...args: unknown[]) =>
    resolveIMessageInboundDecisionMock(...args),
  buildIMessageInboundContext: vi.fn(() => ({ ctxPayload: {}, chatTarget: "chat_id:1" })),
}));

vi.mock("../client.js", () => ({
  createIMessageRpcClient: (...args: unknown[]) => createIMessageRpcClientMock(...args),
}));

vi.mock("../send.js", () => ({
  sendMessageIMessage: vi.fn(async () => ({ messageId: "imsg-1" })),
}));

vi.mock("../../auto-reply/inbound-debounce.js", () => ({
  resolveInboundDebounceMs: vi.fn(() => 0),
  createInboundDebouncer: vi.fn(
    (params: { onFlush: (entries: Array<{ message: unknown }>) => Promise<void> }) => ({
      enqueue: async (entry: { message: unknown }) => {
        await params.onFlush([entry]);
      },
    }),
  ),
}));

import { monitorIMessageProvider } from "./monitor-provider.js";

describe("monitorIMessageProvider account-scoped pairing store", () => {
  beforeEach(() => {
    readChannelAllowFromStoreMock.mockReset().mockResolvedValue([]);
    upsertChannelPairingRequestMock
      .mockReset()
      .mockResolvedValue({ code: "PAIRCODE", created: false });
    parseIMessageNotificationMock.mockReset().mockReturnValue({
      sender: "+15550001111",
      text: "hello",
      is_from_me: false,
      is_group: false,
    });
    resolveIMessageInboundDecisionMock.mockReset().mockReturnValue({
      kind: "pairing",
      senderId: "+15550001111",
    });

    createIMessageRpcClientMock.mockReset().mockImplementation(async (params: unknown) => {
      const onNotification = (params as { onNotification: (msg: unknown) => void }).onNotification;
      return {
        request: vi.fn(async () => ({ subscription: 1 })),
        waitForClose: async () => {
          onNotification({ method: "message", params: { any: "payload" } });
          await Promise.resolve();
        },
        stop: vi.fn(async () => {}),
      };
    });
  });

  it("scopes allow-from reads and pairing upserts by accountId", async () => {
    await monitorIMessageProvider({
      config: {
        channels: {
          imessage: {},
        },
      },
      runtime: {
        log: vi.fn(),
        error: vi.fn(),
      },
      accountId: "work",
    });

    await vi.waitFor(() => {
      expect(readChannelAllowFromStoreMock).toHaveBeenCalledWith("imessage", process.env, "work");
    });
    expect(upsertChannelPairingRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "imessage",
        id: "+15550001111",
        accountId: "work",
      }),
    );
  });
});
