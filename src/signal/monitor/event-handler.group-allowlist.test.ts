import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispatchInboundCaptureMock } from "../../../test/helpers/dispatch-inbound-capture.js";
import type { MsgContext } from "../../auto-reply/templating.js";
import { createSignalEventHandler } from "./event-handler.js";
import {
  createBaseSignalEventHandlerDeps,
  createSignalReceiveEvent,
} from "./event-handler.test-harness.js";

const { readChannelAllowFromStoreMock, upsertChannelPairingRequestMock, sendMessageSignalMock } =
  vi.hoisted(() => ({
    readChannelAllowFromStoreMock: vi.fn(async () => [] as string[]),
    upsertChannelPairingRequestMock: vi.fn(async () => ({ code: "PAIR", created: true })),
    sendMessageSignalMock: vi.fn(async () => true),
  }));

const { sendTypingMock, sendReadReceiptMock } = vi.hoisted(() => ({
  sendTypingMock: vi.fn(async () => true),
  sendReadReceiptMock: vi.fn(async () => true),
}));

let capturedCtx: MsgContext | undefined;

vi.mock("../../auto-reply/dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auto-reply/dispatch.js")>();
  return buildDispatchInboundCaptureMock(actual, (ctx) => {
    capturedCtx = ctx as MsgContext;
  });
});

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: readChannelAllowFromStoreMock,
  upsertChannelPairingRequest: upsertChannelPairingRequestMock,
}));

vi.mock("../send.js", () => ({
  sendMessageSignal: sendMessageSignalMock,
  sendTypingSignal: sendTypingMock,
  sendReadReceiptSignal: sendReadReceiptMock,
}));

describe("signal group allowlist isolation", () => {
  beforeEach(() => {
    capturedCtx = undefined;
    readChannelAllowFromStoreMock.mockReset().mockResolvedValue([]);
    upsertChannelPairingRequestMock.mockReset().mockResolvedValue({ code: "PAIR", created: true });
    sendMessageSignalMock.mockReset().mockResolvedValue(true);
    sendTypingMock.mockReset().mockResolvedValue(true);
    sendReadReceiptMock.mockReset().mockResolvedValue(true);
  });

  it("blocks group sender not in groupAllowFrom even when sender exists in DM pairing store", async () => {
    readChannelAllowFromStoreMock.mockResolvedValueOnce(["+15550001111"]);

    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        cfg: { messages: { inbound: { debounceMs: 0 } } },
        dmPolicy: "pairing",
        allowFrom: [],
        groupPolicy: "allowlist",
        groupAllowFrom: ["+15550002222"],
      }),
    );

    await handler(
      createSignalReceiveEvent({
        dataMessage: {
          message: "hello group",
          attachments: [],
          groupInfo: { groupId: "g1", groupName: "Test Group" },
        },
      }),
    );

    expect(capturedCtx).toBeUndefined();
  });
});
