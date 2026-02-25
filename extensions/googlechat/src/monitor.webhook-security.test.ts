import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockServerResponse } from "../../../src/test-utils/mock-http-response.js";
import type { ResolvedGoogleChatAccount } from "./accounts.js";
import { verifyGoogleChatRequest } from "./auth.js";
import {
  clearGoogleChatWebhookRateLimits,
  getGoogleChatWebhookRateLimitStateSize,
  handleGoogleChatWebhookRequest,
  isGoogleChatWebhookRateLimited,
  registerGoogleChatWebhookTarget,
} from "./monitor.js";

vi.mock("./auth.js", () => ({
  verifyGoogleChatRequest: vi.fn(),
}));

function createWebhookRequest(params: {
  payload: unknown;
  path?: string;
  remoteAddress?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & {
    destroyed?: boolean;
    destroy: (error?: Error) => IncomingMessage;
  };
  req.method = "POST";
  req.url = params.path ?? "/googlechat-security";
  req.headers = {
    authorization: "",
    "content-type": "application/json",
  };
  req.socket = { remoteAddress: params.remoteAddress ?? "127.0.0.1" } as IncomingMessage["socket"];
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

afterEach(() => {
  clearGoogleChatWebhookRateLimits();
});

describe("Google Chat webhook ingress security", () => {
  it("rate limits unauthenticated burst traffic with 429", async () => {
    vi.mocked(verifyGoogleChatRequest).mockResolvedValue({ ok: false, reason: "invalid" });

    const unregister = registerGoogleChatWebhookTarget({
      account: baseAccount("security"),
      config: {} as OpenClawConfig,
      runtime: {},
      core: {} as PluginRuntime,
      path: "/googlechat-security",
      mediaMaxMb: 5,
    });

    try {
      let saw429 = false;
      for (let i = 0; i < 130; i += 1) {
        const res = createMockServerResponse();
        const handled = await handleGoogleChatWebhookRequest(
          createWebhookRequest({
            path: "/googlechat-security",
            payload: { type: "ADDED_TO_SPACE", space: { name: "spaces/SECURITY" } },
          }),
          res,
        );
        expect(handled).toBe(true);

        if (res.statusCode === 429) {
          expect(res.body).toBe("Too Many Requests");
          saw429 = true;
          break;
        }
        expect(res.statusCode).toBe(401);
      }

      expect(saw429).toBe(true);
    } finally {
      unregister();
    }
  });

  it("bounds tracked rate-limit keys to prevent unbounded memory growth", () => {
    const now = 1_000_000;
    for (let i = 0; i < 4_500; i += 1) {
      isGoogleChatWebhookRateLimited(`/googlechat-security:key-${i}`, now);
    }
    expect(getGoogleChatWebhookRateLimitStateSize()).toBeLessThanOrEqual(4_096);
  });
});
