import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBaseSignalEventHandlerDeps,
  createSignalReceiveEvent,
} from "./event-handler.test-harness.js";
import type { SignalReactionMessage } from "./event-handler.types.js";

const dispatchMock = vi.fn();
const readAllowFromMock = vi.fn();
const upsertPairingRequestMock = vi.fn();

vi.mock("../../auto-reply/dispatch.js", () => ({
  dispatchInboundMessage: (...args: unknown[]) => dispatchMock(...args),
}));

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));

describe("signal pairing account scoping", () => {
  beforeEach(() => {
    dispatchMock.mockReset().mockImplementation(async () => ({
      queuedFinal: true,
      counts: { tool: 0, block: 0, final: 1 },
    }));
    readAllowFromMock.mockReset().mockResolvedValue([]);
    upsertPairingRequestMock.mockReset().mockResolvedValue({ code: "ABCDEFGH", created: false });
  });

  it("reads pairing allow store with account-scoped key", async () => {
    readAllowFromMock.mockResolvedValue(["+15550002222"]);

    const { createSignalEventHandler } = await import("./event-handler.js");
    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        // oxlint-disable-next-line typescript/no-explicit-any
        cfg: { messages: { inbound: { debounceMs: 0 } } } as any,
        accountId: "work",
        dmPolicy: "pairing",
        allowFrom: [],
        groupAllowFrom: [],
      }),
    );

    await handler(
      createSignalReceiveEvent({
        sourceNumber: "+15550002222",
        sourceName: "Alice",
        dataMessage: {
          message: "hello",
          attachments: [],
        },
      }),
    );

    expect(readAllowFromMock).toHaveBeenCalledWith("signal", expect.any(Object), "work");
    expect(dispatchMock).toHaveBeenCalled();
  });

  it("stores pairing requests with account-scoped key", async () => {
    const { createSignalEventHandler } = await import("./event-handler.js");
    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        // oxlint-disable-next-line typescript/no-explicit-any
        cfg: { messages: { inbound: { debounceMs: 0 } } } as any,
        accountId: "work",
        dmPolicy: "pairing",
        allowFrom: [],
        groupAllowFrom: [],
        isSignalReactionMessage: (
          _reaction: SignalReactionMessage | null | undefined,
        ): _reaction is SignalReactionMessage => false,
      }),
    );

    await handler(
      createSignalReceiveEvent({
        sourceNumber: "+15550003333",
        sourceName: "Alice",
        dataMessage: {
          message: "hello",
          attachments: [],
        },
      }),
    );

    expect(upsertPairingRequestMock).toHaveBeenCalledWith({
      channel: "signal",
      id: "+15550003333",
      accountId: "work",
      meta: { name: "Alice" },
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
