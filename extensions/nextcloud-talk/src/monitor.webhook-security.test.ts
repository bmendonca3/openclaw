import type { IncomingMessage } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearNextcloudWebhookRateLimits,
  createNextcloudTalkWebhookServer,
  getNextcloudWebhookRateLimitStateSize,
  isNextcloudWebhookRateLimited,
  resolveNextcloudWebhookClientIp,
} from "./monitor.js";

type ServerHarness = {
  stop: () => Promise<void>;
  webhookUrl: string;
};

async function startWebhookServer(path: string): Promise<ServerHarness> {
  const { server, start } = createNextcloudTalkWebhookServer({
    port: 0,
    host: "127.0.0.1",
    path,
    secret: "nextcloud-secret",
    onMessage: vi.fn(),
  });
  await start();
  const address = server.address() as AddressInfo | null;
  if (!address) {
    throw new Error("missing server address");
  }
  return {
    webhookUrl: `http://127.0.0.1:${address.port}${path}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const cleanupFns: Array<() => Promise<void>> = [];

afterEach(async () => {
  clearNextcloudWebhookRateLimits();
  while (cleanupFns.length > 0) {
    const cleanup = cleanupFns.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("Nextcloud Talk webhook ingress security", () => {
  it("rate limits webhook burst traffic with 429", async () => {
    const harness = await startWebhookServer("/nextcloud-rate-limit");
    cleanupFns.push(harness.stop);

    let saw429 = false;
    for (let i = 0; i < 130; i += 1) {
      const response = await fetch(harness.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (response.status === 429) {
        saw429 = true;
        expect(await response.json()).toEqual({ error: "Too Many Requests" });
        break;
      }
    }

    expect(saw429).toBe(true);
  });

  it("bounds tracked webhook rate limit keys to avoid unbounded memory growth", () => {
    const now = 1_000_000;
    for (let i = 0; i < 4_500; i += 1) {
      isNextcloudWebhookRateLimited(`/nextcloud-memory:key-${i}`, now);
    }
    expect(getNextcloudWebhookRateLimitStateSize()).toBeLessThanOrEqual(4_096);
  });

  it("prunes stale rate-limit entries on periodic cleanup", () => {
    const now = 2_000_000;
    for (let i = 0; i < 100; i += 1) {
      isNextcloudWebhookRateLimited(`/nextcloud-stale:key-${i}`, now);
    }
    expect(getNextcloudWebhookRateLimitStateSize()).toBe(100);

    isNextcloudWebhookRateLimited("/nextcloud-stale:fresh", now + 60_001);
    expect(getNextcloudWebhookRateLimitStateSize()).toBe(1);
  });

  it("trusts x-forwarded-for only when traffic comes from loopback proxy", () => {
    const fromLoopback = {
      headers: { "x-forwarded-for": "198.51.100.25, 127.0.0.1" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    expect(resolveNextcloudWebhookClientIp(fromLoopback)).toBe("198.51.100.25");

    const fromNonLoopback = {
      headers: { "x-forwarded-for": "198.51.100.25" },
      socket: { remoteAddress: "203.0.113.9" },
    } as unknown as IncomingMessage;
    expect(resolveNextcloudWebhookClientIp(fromNonLoopback)).toBe("203.0.113.9");
  });
});
