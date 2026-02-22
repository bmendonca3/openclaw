import { afterEach, describe, expect, test } from "vitest";
import { WebSocket, type ClientOptions } from "ws";
import {
  connectReq,
  getFreePort,
  installGatewayTestHooks,
  startGatewayServer,
  testState,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

async function openSocket(url: string, options?: ClientOptions): Promise<WebSocket> {
  const ws = new WebSocket(url, [], options);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout opening websocket: ${url}`)), 10_000);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("open", onOpen);
      ws.off("error", onError);
      ws.off("close", onClose);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onClose = (code: number, reason: Buffer) => {
      cleanup();
      reject(new Error(`closed ${code}: ${reason.toString()}`));
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
    ws.once("close", onClose);
  });
  return ws;
}

async function closeSocket(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    ws.once("close", () => resolve());
    ws.close();
  });
}

describe("gateway server TLS", () => {
  afterEach(() => {
    testState.gatewayTls = undefined;
  });

  test("accepts wss clients and rejects plaintext ws when TLS is enabled", async () => {
    testState.gatewayTls = {
      enabled: true,
      autoGenerate: true,
    };
    const port = await getFreePort();
    const server = await startGatewayServer(port, { controlUiEnabled: false });
    try {
      const secure = await openSocket(`wss://127.0.0.1:${port}`, {
        rejectUnauthorized: false,
      });
      try {
        const res = await connectReq(secure);
        expect(res.ok).toBe(true);
      } finally {
        await closeSocket(secure);
      }

      await expect(openSocket(`ws://127.0.0.1:${port}`)).rejects.toBeDefined();
    } finally {
      await server.close();
    }
  });
});
