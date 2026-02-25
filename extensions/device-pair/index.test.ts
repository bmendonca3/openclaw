import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

type RegisteredCommand = Parameters<OpenClawPluginApi["registerCommand"]>[0];
type RegisteredCommandHandler = RegisteredCommand["handler"];

const resolveGatewayBindUrlMock = vi.hoisted(() =>
  vi.fn(() => ({ url: "ws://public.example:18789", source: "gateway.bind=lan" })),
);
const createDevicePairingBootstrapTokenMock = vi.hoisted(() =>
  vi.fn(async () => ({
    token: "bootstrap-setup-token",
    expiresAtMs: Date.now() + 60_000,
  })),
);

vi.mock("openclaw/plugin-sdk", () => ({
  approveDevicePairing: vi.fn(),
  createDevicePairingBootstrapToken: createDevicePairingBootstrapTokenMock,
  listDevicePairing: vi.fn(async () => ({ pending: [] })),
  resolveGatewayBindUrl: resolveGatewayBindUrlMock,
  runPluginCommandWithTimeout: vi.fn(),
  resolveTailnetHostWithRunner: vi.fn(async () => null),
}));

import register from "./index.js";

function decodeSetupCode(setupCode: string): Record<string, unknown> {
  const normalized = setupCode.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const json = Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

function registerPairCommand(config: OpenClawPluginApi["config"]): RegisteredCommandHandler {
  let pairCommandHandler: RegisteredCommandHandler | null = null;
  const registerCommand: OpenClawPluginApi["registerCommand"] = (command: RegisteredCommand) => {
    if (command.name === "pair") {
      pairCommandHandler = command.handler;
    }
  };
  const api: OpenClawPluginApi = {
    id: "device-pair",
    name: "device-pair",
    source: "test",
    config,
    runtime: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerProviderPlugin: vi.fn(),
    registerMemoryPlugin: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerHttpPath: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerConfigHook: vi.fn(),
    registerChannel: vi.fn(),
    registerCommand,
    getPluginConfig: vi.fn(),
    getDataDir: vi.fn(),
    getStateDir: vi.fn(),
    getWorkspaceDir: vi.fn(),
  } as unknown as OpenClawPluginApi;
  register(api);
  if (!pairCommandHandler) {
    throw new Error("pair command was not registered");
  }
  return pairCommandHandler;
}

describe("device-pair setup code", () => {
  const originalToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  afterEach(() => {
    process.env.OPENCLAW_GATEWAY_TOKEN = originalToken;
    createDevicePairingBootstrapTokenMock.mockClear();
    resolveGatewayBindUrlMock.mockClear();
  });

  it("embeds a one-time bootstrap token instead of gateway credentials", async () => {
    process.env.OPENCLAW_GATEWAY_TOKEN = "super-secret-token";

    const pairCommandHandler = registerPairCommand({
      gateway: {
        bind: "lan",
      },
    });

    const result = await pairCommandHandler({
      senderId: "user-1",
      channel: "discord",
      isAuthorizedSender: true,
      commandBody: "/pair",
      config: { gateway: { bind: "lan" } },
      from: "discord:user-1",
      to: "discord:user-1",
    });

    expect(createDevicePairingBootstrapTokenMock).toHaveBeenCalledTimes(1);
    expect(resolveGatewayBindUrlMock).toHaveBeenCalled();
    expect(typeof result.text).toBe("string");
    const reply = result.text ?? "";
    const lines = reply.split("\n");
    const markerIndex = lines.indexOf("Setup code:");
    expect(markerIndex).toBeGreaterThan(-1);
    const setupCode = lines[markerIndex + 1]?.trim() ?? "";
    expect(setupCode).not.toHaveLength(0);

    const payload = decodeSetupCode(setupCode);
    expect(payload).toEqual({
      url: "ws://public.example:18789",
      token: "bootstrap-setup-token",
    });
    expect(payload).not.toHaveProperty("password");
    expect(payload.token).not.toBe("super-secret-token");
  });
});
