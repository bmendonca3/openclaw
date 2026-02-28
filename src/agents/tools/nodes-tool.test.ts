import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  callGatewayTool: vi.fn(),
  readGatewayCallOptions: vi.fn(() => ({})),
}));

const nodeUtilsMocks = vi.hoisted(() => ({
  resolveNodeId: vi.fn(async () => "node-1"),
  listNodes: vi.fn(async () => []),
  resolveNodeIdFromList: vi.fn(() => "node-1"),
}));

const screenMocks = vi.hoisted(() => ({
  parseScreenRecordPayload: vi.fn(() => ({
    base64: "ZmFrZQ==",
    format: "mp4",
    durationMs: 60_000,
    fps: 10,
    screenIndex: 0,
    hasAudio: true,
  })),
  screenRecordTempPath: vi.fn(() => "/tmp/screen-record.mp4"),
  writeScreenRecordToFile: vi.fn(async () => ({ path: "/tmp/screen-record.mp4" })),
}));

vi.mock("./gateway.js", () => ({
  callGatewayTool: gatewayMocks.callGatewayTool,
  readGatewayCallOptions: gatewayMocks.readGatewayCallOptions,
}));

vi.mock("./nodes-utils.js", () => ({
  resolveNodeId: nodeUtilsMocks.resolveNodeId,
  listNodes: nodeUtilsMocks.listNodes,
  resolveNodeIdFromList: nodeUtilsMocks.resolveNodeIdFromList,
}));

vi.mock("../../cli/nodes-screen.js", () => ({
  parseScreenRecordPayload: screenMocks.parseScreenRecordPayload,
  screenRecordTempPath: screenMocks.screenRecordTempPath,
  writeScreenRecordToFile: screenMocks.writeScreenRecordToFile,
}));

import { createNodesTool } from "./nodes-tool.js";

describe("createNodesTool screen_record duration guardrails", () => {
  beforeEach(() => {
    gatewayMocks.callGatewayTool.mockReset();
    gatewayMocks.readGatewayCallOptions.mockReset();
    gatewayMocks.readGatewayCallOptions.mockReturnValue({});
    nodeUtilsMocks.resolveNodeId.mockClear();
    screenMocks.parseScreenRecordPayload.mockClear();
    screenMocks.writeScreenRecordToFile.mockClear();
  });

  it("caps durationMs schema at 60000", () => {
    const tool = createNodesTool();
    const schema = tool.parameters as {
      properties?: {
        durationMs?: {
          maximum?: number;
        };
      };
    };
    expect(schema.properties?.durationMs?.maximum).toBe(60_000);
  });

  it("rejects durationMs values above 60000 before gateway invoke", async () => {
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

  it("rejects parsed duration strings above 60000 before gateway invoke", async () => {
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
