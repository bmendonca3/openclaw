import crypto from "node:crypto";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCallConfigSchema, type VoiceCallConfig } from "./config.js";
import type { CallManager } from "./manager.js";
import type { VoiceCallProvider } from "./providers/base.js";
import type { CallRecord } from "./types.js";
import { VoiceCallWebhookServer } from "./webhook.js";

const provider: VoiceCallProvider = {
  name: "mock",
  verifyWebhook: () => ({ ok: true }),
  parseWebhookEvent: () => ({ events: [] }),
  initiateCall: async () => ({ providerCallId: "provider-call", status: "initiated" }),
  hangupCall: async () => {},
  playTts: async () => {},
  startListening: async () => {},
  stopListening: async () => {},
};

const createConfig = (overrides: Partial<VoiceCallConfig> = {}): VoiceCallConfig => {
  const base = VoiceCallConfigSchema.parse({});
  base.serve.port = 0;

  return {
    ...base,
    ...overrides,
    serve: {
      ...base.serve,
      ...(overrides.serve ?? {}),
    },
  };
};

const createCall = (startedAt: number): CallRecord => ({
  callId: "call-1",
  providerCallId: "provider-call-1",
  provider: "mock",
  direction: "outbound",
  state: "initiated",
  from: "+15550001234",
  to: "+15550005678",
  startedAt,
  transcript: [],
  processedEventIds: [],
});

const createManager = (calls: CallRecord[]) => {
  const endCall = vi.fn(async () => ({ success: true }));
  const manager = {
    getActiveCalls: () => calls,
    endCall,
  } as unknown as CallManager;

  return { manager, endCall };
};

function createWebhookRequestManager() {
  const processEvent = vi.fn();
  return {
    manager: {
      getActiveCalls: () => [],
      processEvent,
      getCallByProviderCallId: () => undefined,
    } as unknown as CallManager,
    processEvent,
  };
}

const getListeningPort = (server: VoiceCallWebhookServer): number => {
  const listeningServer = (server as unknown as { server?: { address?: () => unknown } }).server;
  const address = listeningServer?.address?.() as { port?: number } | string | null | undefined;
  if (!address || typeof address === "string" || typeof address.port !== "number") {
    throw new Error("webhook server did not expose a listen address");
  }
  return address.port;
};

async function sendRawUpgrade(params: {
  host: string;
  port: number;
  path: string;
  hostHeader: string;
}): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: params.host, port: params.port });
    socket.setEncoding("utf8");
    socket.setTimeout(2000);

    let response = "";

    socket.on("connect", () => {
      socket.write(
        `GET ${params.path} HTTP/1.1\r\n` +
          `Host: ${params.hostHeader}\r\n` +
          "Connection: Upgrade\r\n" +
          "Upgrade: websocket\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          "Sec-WebSocket-Version: 13\r\n" +
          "\r\n",
      );
    });

    socket.on("data", (chunk) => {
      response += chunk;
    });

    socket.on("timeout", () => {
      socket.destroy(new Error("upgrade request timed out"));
    });

    socket.on("error", reject);
    socket.on("close", () => resolve(response));
  });
}

async function sendRawPost(params: {
  host: string;
  port: number;
  path: string;
  hostHeader: string;
  body: string;
}): Promise<string> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: params.host, port: params.port });
    socket.setEncoding("utf8");
    socket.setTimeout(2000);

    let response = "";

    socket.on("connect", () => {
      const contentLength = Buffer.byteLength(params.body, "utf8");
      socket.write(
        `POST ${params.path} HTTP/1.1\r\n` +
          `Host: ${params.hostHeader}\r\n` +
          "Content-Type: application/x-www-form-urlencoded\r\n" +
          `Content-Length: ${contentLength}\r\n` +
          "Connection: close\r\n" +
          "\r\n" +
          params.body,
      );
    });

    socket.on("data", (chunk) => {
      response += chunk;
    });

    socket.on("timeout", () => {
      socket.destroy(new Error("post request timed out"));
    });

    socket.on("error", reject);
    socket.on("close", () => resolve(response));
  });
}

describe("VoiceCallWebhookServer stale call reaper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends calls older than staleCallReaperSeconds", async () => {
    const now = new Date("2026-02-16T00:00:00Z");
    vi.setSystemTime(now);

    const call = createCall(now.getTime() - 120_000);
    const { manager, endCall } = createManager([call]);
    const config = createConfig({ staleCallReaperSeconds: 60 });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(endCall).toHaveBeenCalledWith(call.callId);
    } finally {
      await server.stop();
    }
  });

  it("skips calls that are younger than the threshold", async () => {
    const now = new Date("2026-02-16T00:00:00Z");
    vi.setSystemTime(now);

    const call = createCall(now.getTime() - 10_000);
    const { manager, endCall } = createManager([call]);
    const config = createConfig({ staleCallReaperSeconds: 60 });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(endCall).not.toHaveBeenCalled();
    } finally {
      await server.stop();
    }
  });

  it("does not run when staleCallReaperSeconds is disabled", async () => {
    const now = new Date("2026-02-16T00:00:00Z");
    vi.setSystemTime(now);

    const call = createCall(now.getTime() - 120_000);
    const { manager, endCall } = createManager([call]);
    const config = createConfig({ staleCallReaperSeconds: 0 });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(endCall).not.toHaveBeenCalled();
    } finally {
      await server.stop();
    }
  });
});

describe("VoiceCallWebhookServer replay protection", () => {
  it("drops replayed signed webhook requests before event processing", async () => {
    const { manager, processEvent } = createWebhookRequestManager();
    const replaySensitiveProvider: VoiceCallProvider = {
      name: "telnyx",
      verifyWebhook: () => ({ ok: true }),
      parseWebhookEvent: () => ({
        events: [
          {
            id: crypto.randomUUID(),
            type: "call.ringing",
            callId: "call-1",
            providerCallId: "provider-call-1",
            timestamp: Date.now(),
          },
        ],
      }),
      initiateCall: async () => ({ providerCallId: "provider-call", status: "initiated" }),
      hangupCall: async () => {},
      playTts: async () => {},
      startListening: async () => {},
      stopListening: async () => {},
    };

    const config = createConfig({
      serve: {
        port: 0,
        bind: "127.0.0.1",
        path: "/voice/webhook",
      },
      staleCallReaperSeconds: 0,
    });

    const server = new VoiceCallWebhookServer(config, manager, replaySensitiveProvider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const url = `http://127.0.0.1:${port}/voice/webhook`;
      const headers = {
        "content-type": "application/json",
        "telnyx-signature-ed25519": "signature-replay-test",
        "telnyx-timestamp": "1708041600",
      };
      const body = JSON.stringify({ data: { event_type: "call.ringing" } });

      const first = await fetch(url, { method: "POST", headers, body });
      expect(first.status).toBe(200);

      const second = await fetch(url, { method: "POST", headers, body });
      expect(second.status).toBe(200);

      expect(processEvent).toHaveBeenCalledTimes(1);
    } finally {
      await server.stop();
    }
  });

  it("falls back to body fingerprint replay keys when Twilio idempotency token is missing", async () => {
    const { manager, processEvent } = createWebhookRequestManager();
    const twilioProvider: VoiceCallProvider = {
      name: "twilio",
      verifyWebhook: () => ({ ok: true }),
      parseWebhookEvent: () => ({
        events: [
          {
            id: crypto.randomUUID(),
            type: "call.ringing",
            callId: "call-2",
            providerCallId: "provider-call-2",
            timestamp: Date.now(),
          },
        ],
      }),
      initiateCall: async () => ({ providerCallId: "provider-call", status: "initiated" }),
      hangupCall: async () => {},
      playTts: async () => {},
      startListening: async () => {},
      stopListening: async () => {},
    };

    const config = createConfig({
      serve: {
        port: 0,
        bind: "127.0.0.1",
        path: "/voice/webhook",
      },
      staleCallReaperSeconds: 0,
    });

    const server = new VoiceCallWebhookServer(config, manager, twilioProvider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const url = `http://127.0.0.1:${port}/voice/webhook`;
      const headers = {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "signature-no-idempotency-token",
      };
      const body = "CallSid=CA123&CallStatus=ringing";

      const first = await fetch(url, { method: "POST", headers, body });
      expect(first.status).toBe(200);

      const second = await fetch(url, { method: "POST", headers, body });
      expect(second.status).toBe(200);

      expect(processEvent).toHaveBeenCalledTimes(1);
    } finally {
      await server.stop();
    }
  });
});

describe("VoiceCallWebhookServer request path checks", () => {
  it("accepts requests on the configured webhook path", async () => {
    const { manager } = createManager([]);
    const config = createConfig({ serve: { port: 0, bind: "127.0.0.1", path: "/voice/webhook" } });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const response = await fetch(`http://127.0.0.1:${port}/voice/webhook`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "CallSid=CA123",
      });
      expect(response.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("rejects prefixed paths that only start with the webhook path", async () => {
    const { manager } = createManager([]);
    const config = createConfig({ serve: { port: 0, bind: "127.0.0.1", path: "/voice/webhook" } });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const response = await fetch(`http://127.0.0.1:${port}/voice/webhook-attacker`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "CallSid=CA123",
      });
      expect(response.status).toBe(404);
    } finally {
      await server.stop();
    }
  });
});

describe("VoiceCallWebhookServer websocket upgrade hardening", () => {
  it("rejects malformed host headers without crashing the process", async () => {
    const baseConfig = createConfig();
    const config: VoiceCallConfig = {
      ...baseConfig,
      staleCallReaperSeconds: 0,
      streaming: {
        ...baseConfig.streaming,
        enabled: true,
        openaiApiKey: "test-openai-key",
      },
    };

    const manager = {
      getActiveCalls: () => [],
      endCall: vi.fn(async () => ({ success: true })),
      getCallByProviderCallId: vi.fn(() => undefined),
      getCall: vi.fn(() => undefined),
      processEvent: vi.fn(),
      speakInitialMessage: vi.fn(async () => {}),
      speak: vi.fn(async () => {}),
    } as unknown as CallManager;

    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const webhookUrl = `http://${config.serve.bind}:${port}${config.serve.path}`;

      const upgradeResponse = await sendRawUpgrade({
        host: config.serve.bind,
        port,
        path: config.streaming.streamPath,
        hostHeader: "[::1",
      });

      expect(upgradeResponse).toContain("400 Bad Request");

      // Ensure malformed upgrade requests do not take down the webhook server.
      const healthyRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "event=health-check",
      });
      expect(healthyRes.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("rejects malformed host headers on POST requests and keeps serving healthy traffic", async () => {
    const { manager } = createManager([]);
    const config = createConfig({ serve: { port: 0, bind: "127.0.0.1", path: "/voice/webhook" } });
    const server = new VoiceCallWebhookServer(config, manager, provider);

    try {
      await server.start();
      const port = getListeningPort(server);
      const badPostResponse = await sendRawPost({
        host: config.serve.bind,
        port,
        path: config.serve.path,
        hostHeader: "[::1",
        body: "CallSid=CA123",
      });

      expect(badPostResponse).toContain("400 Bad Request");

      const healthyResponse = await fetch(
        `http://${config.serve.bind}:${port}${config.serve.path}`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "CallSid=CA123",
        },
      );
      expect(healthyResponse.status).toBe(200);
    } finally {
      await server.stop();
    }
  });
});
