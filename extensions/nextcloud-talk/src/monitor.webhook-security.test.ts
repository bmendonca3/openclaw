import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNextcloudTalkWebhookServer } from "./monitor.js";

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
});
