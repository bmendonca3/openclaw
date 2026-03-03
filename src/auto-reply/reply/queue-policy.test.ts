import { describe, expect, it } from "vitest";
import { resolveActiveRunQueueAction } from "./queue-policy.js";

describe("resolveActiveRunQueueAction", () => {
  it("runs immediately when there is no active run", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: false,
        isHeartbeat: false,
        shouldFollowup: true,
        queueMode: "collect",
      }),
    ).toBe("run-now");
  });

  it("runs heartbeat system-prompt work immediately when inactive", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: false,
        isHeartbeat: true,
        hasQueuedSystemPrompt: true,
        shouldFollowup: false,
        queueMode: "interrupt",
      }),
    ).toBe("run-now");
  });

  it("drops heartbeat runs while another run is active", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: true,
        isHeartbeat: true,
        hasQueuedSystemPrompt: false,
        shouldFollowup: true,
        queueMode: "collect",
      }),
    ).toBe("drop");
  });

  it("enqueues heartbeat runs with queued system events while active", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: true,
        isHeartbeat: true,
        hasQueuedSystemPrompt: true,
        shouldFollowup: true,
        queueMode: "collect",
      }),
    ).toBe("enqueue-followup");
  });

  it("enqueues heartbeat system-prompt runs even in interrupt mode while active", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: true,
        isHeartbeat: true,
        hasQueuedSystemPrompt: true,
        shouldFollowup: false,
        queueMode: "interrupt",
      }),
    ).toBe("enqueue-followup");
  });

  it("enqueues followups for non-heartbeat active runs", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: true,
        isHeartbeat: false,
        shouldFollowup: true,
        queueMode: "collect",
      }),
    ).toBe("enqueue-followup");
  });

  it("enqueues steer mode runs while active", () => {
    expect(
      resolveActiveRunQueueAction({
        isActive: true,
        isHeartbeat: false,
        shouldFollowup: false,
        queueMode: "steer",
      }),
    ).toBe("enqueue-followup");
  });
});
