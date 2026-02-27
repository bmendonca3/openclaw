import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createMockServerResponse } from "../../../src/test-utils/mock-http-response.js";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import { verifyGoogleChatRequest } from "./auth.js";
import { handleGoogleChatWebhookRequest, registerGoogleChatWebhookTarget } from "./monitor.js";

vi.mock("./auth.js", () => ({
  verifyGoogleChatRequest: vi.fn(),
}));

function createWebhookRequest(params: {
  authorization?: string;
  payload: unknown;
  path?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & {
    destroyed?: boolean;
    destroy: (error?: Error) => IncomingMessage;
  };
  req.method = "POST";
  req.url = params.path ?? "/googlechat";
  req.headers = {
    authorization: params.authorization ?? "",
    "content-type": "application/json",
  };
  req.destroyed = false;
  req.destroy = () => {
    req.destroyed = true;
    return req;
  };

  void Promise.resolve().then(() => {
    req.emit("data", Buffer.from(JSON.stringify(params.payload), "utf-8"));
    if (!req.destroyed) {
      req.emit("end");
    }
  });

  return req;
}

const baseAccount = (accountId: string) =>
  ({
    accountId,
    enabled: true,
    credentialSource: "none",
    config: {},
  }) as ResolvedGoogleChatAccount;

function registerTwoTargets() {
  const sinkA = vi.fn();
  const sinkB = vi.fn();
  const core = {} as PluginRuntime;
  const config = {} as OpenClawConfig;

  const unregisterA = registerGoogleChatWebhookTarget({
    account: baseAccount("A"),
    config,
    runtime: {},
    core,
    path: "/googlechat",
    statusSink: sinkA,
    mediaMaxMb: 5,
  });
  const unregisterB = registerGoogleChatWebhookTarget({
    account: baseAccount("B"),
    config,
    runtime: {},
    core,
    path: "/googlechat",
    statusSink: sinkB,
    mediaMaxMb: 5,
  });

  return {
    sinkA,
    sinkB,
    unregister: () => {
      unregisterA();
      unregisterB();
    },
  };
}

describe("Google Chat webhook routing", () => {
  it("rejects ambiguous routing when multiple targets on the same path verify successfully", async () => {
    vi.mocked(verifyGoogleChatRequest).mockResolvedValue({ ok: true });

    const { sinkA, sinkB, unregister } = registerTwoTargets();

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: { type: "ADDED_TO_SPACE", space: { name: "spaces/AAA" } },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(401);
      expect(sinkA).not.toHaveBeenCalled();
      expect(sinkB).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("routes to the single verified target when earlier targets fail verification", async () => {
    vi.mocked(verifyGoogleChatRequest)
      .mockResolvedValueOnce({ ok: false, reason: "invalid" })
      .mockResolvedValueOnce({ ok: true });

    const { sinkA, sinkB, unregister } = registerTwoTargets();

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: { type: "ADDED_TO_SPACE", space: { name: "spaces/BBB" } },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(sinkA).not.toHaveBeenCalled();
      expect(sinkB).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it("scopes DM pairing checks to accountId", async () => {
    vi.mocked(verifyGoogleChatRequest).mockResolvedValue({ ok: true });

    const readAllowFromStore = vi.fn(async () => []);
    const upsertPairingRequest = vi.fn(async () => ({ code: "PAIR42", created: false }));
    const core = {
      logging: {
        shouldLogVerbose: () => false,
      },
      channel: {
        commands: {
          shouldComputeCommandAuthorized: () => false,
        },
        pairing: {
          readAllowFromStore,
          upsertPairingRequest,
          buildPairingReply: () => "pairing",
        },
      },
    } as unknown as PluginRuntime;

    const account = {
      accountId: "work",
      enabled: true,
      credentialSource: "service-account",
      config: {
        dm: { policy: "pairing", allowFrom: [] },
        groupPolicy: "allowlist",
      },
    } as unknown as ResolvedGoogleChatAccount;
    const config = {
      channels: {
        googlechat: {
          accounts: {
            work: {
              dm: { policy: "pairing", allowFrom: [] },
            },
          },
        },
      },
    } as OpenClawConfig;

    const unregister = registerGoogleChatWebhookTarget({
      account,
      config,
      runtime: {},
      core,
      path: "/googlechat",
      mediaMaxMb: 5,
    });

    try {
      const res = createMockServerResponse();
      const handled = await handleGoogleChatWebhookRequest(
        createWebhookRequest({
          authorization: "Bearer test-token",
          payload: {
            type: "MESSAGE",
            space: { name: "spaces/WORKDM", type: "DM" },
            message: {
              name: "spaces/WORKDM/messages/1",
              text: "hello",
              sender: {
                name: "users/alice",
                displayName: "Alice",
                email: "alice@example.com",
                type: "HUMAN",
              },
            },
          },
        }),
        res,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      await vi.waitFor(() => {
        expect(readAllowFromStore).toHaveBeenCalledWith({
          channel: "googlechat",
          accountId: "work",
        });
      });
      await vi.waitFor(() => {
        expect(upsertPairingRequest).toHaveBeenCalledWith({
          channel: "googlechat",
          id: "users/alice",
          accountId: "work",
          meta: { name: "Alice", email: "alice@example.com" },
        });
      });
    } finally {
      unregister();
    }
  });
});
