import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { createNextcloudTalkWebhookServer } from "./monitor.js";
import { generateNextcloudTalkSignature } from "./signature.js";
import type { NextcloudTalkWebhookPayload } from "./types.js";

const TEST_SECRET = "nextcloud-secret";

function buildPayload(): NextcloudTalkWebhookPayload {
  return {
    type: "Create",
    actor: { type: "Person", id: "user-1", name: "User One" },
    object: {
      type: "Note",
      id: "message-1",
      name: "hello",
      content: "hello",
      mediaType: "text/plain",
    },
    target: { type: "Collection", id: "room-1", name: "Room 1" },
  };
}

describe("createNextcloudTalkWebhookServer replay handling", () => {
  it("acknowledges replayed signed requests and processes only once", async () => {
    const onMessage = vi.fn(async () => {});
    const server = createNextcloudTalkWebhookServer({
      port: 0,
      host: "127.0.0.1",
      path: "/nextcloud-talk-webhook",
      secret: TEST_SECRET,
      onMessage,
    });

    await server.start();
    const address = server.server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("Expected webhook server to bind an address");
    }

    const body = JSON.stringify(buildPayload());
    const { random, signature } = generateNextcloudTalkSignature({
      body,
      secret: TEST_SECRET,
    });
    const url = `http://127.0.0.1:${address.port}/nextcloud-talk-webhook`;
    const headers = {
      "content-type": "application/json",
      "x-nextcloud-talk-signature": signature,
      "x-nextcloud-talk-random": random,
      "x-nextcloud-talk-backend": "https://cloud.example.com",
    };

    try {
      const first = await fetch(url, { method: "POST", headers, body });
      const second = await fetch(url, { method: "POST", headers, body });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(onMessage).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => {
        server.server.close(() => resolve());
      });
    }
  });
});
