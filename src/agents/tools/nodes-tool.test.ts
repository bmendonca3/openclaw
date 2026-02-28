import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  callGatewayTool: vi.fn(),
}));

vi.mock("./gateway.js", async () => {
  return {
    callGatewayTool: (...args: unknown[]) => gatewayMocks.callGatewayTool(...args),
    readGatewayCallOptions: (params: Record<string, unknown>) => ({
      gatewayUrl: typeof params.gatewayUrl === "string" ? params.gatewayUrl : undefined,
      gatewayToken: typeof params.gatewayToken === "string" ? params.gatewayToken : undefined,
      timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
    }),
  };
});

import { createNodesTool } from "./nodes-tool.js";

describe("nodes tool screen_record duration limits", () => {
  beforeEach(() => {
    gatewayMocks.callGatewayTool.mockReset();
  });

  it("rejects durationMs values above the node runtime limit before calling the gateway", async () => {
    const tool = createNodesTool();

    await expect(
      tool.execute("call-screen-record-too-long-ms", {
        action: "screen_record",
        node: "ios-node",
        durationMs: 3_600_000,
      }),
    ).rejects.toThrow("screen_record durationMs must be at most 60000");
    expect(gatewayMocks.callGatewayTool).not.toHaveBeenCalled();
  });

  it("rejects parsed duration strings above the node runtime limit before calling the gateway", async () => {
    const tool = createNodesTool();

    await expect(
      tool.execute("call-screen-record-too-long-duration", {
        action: "screen_record",
        node: "ios-node",
        duration: "1h",
      }),
    ).rejects.toThrow("screen_record durationMs must be at most 60000");
    expect(gatewayMocks.callGatewayTool).not.toHaveBeenCalled();
  });
});
