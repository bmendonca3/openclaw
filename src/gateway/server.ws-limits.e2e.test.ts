import { describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { withEnvAsync } from "../test-utils/env.js";
import {
  connectReq,
  installGatewayTestHooks,
  trackConnectChallengeNonce,
  withGatewayServer,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

async function openWs(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  trackConnectChallengeNonce(ws);
  ws.on("error", () => {
    // close assertions are handled by tests; ignore transport errors here.
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for ws open")), 5_000);
    const onOpen = () => {
      clearTimeout(timer);
      ws.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      clearTimeout(timer);
      ws.off("open", onOpen);
      reject(err);
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
  });
  return ws;
}

async function waitForCloseInfo(
  ws: WebSocket,
  timeoutMs = 5_000,
): Promise<{ code: number; reason: string }> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for ws close")), timeoutMs);
    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe("gateway ws limits", () => {
  test("enforces per-IP concurrent connection limits", async () => {
    await withEnvAsync(
      {
        OPENCLAW_TEST_WS_MAX_CONNECTIONS_PER_IP: "1",
      },
      async () => {
        await withGatewayServer(async ({ port }) => {
          const ws1 = await openWs(port);
          const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
          ws2.on("error", () => {
            // asserted via close code
          });
          try {
            const closeInfo = await waitForCloseInfo(ws2);
            expect(closeInfo.code).toBe(1008);
            expect(closeInfo.reason).toContain("too many concurrent ws connections for ip");
          } finally {
            ws1.close();
            ws2.close();
          }
        });
      },
    );
  });

  test("enforces per-IP pre-auth connect rate limits", async () => {
    await withEnvAsync(
      {
        OPENCLAW_TEST_WS_CONNECT_RATE_LIMIT_MAX_ATTEMPTS: "1",
        OPENCLAW_TEST_WS_CONNECT_RATE_LIMIT_WINDOW_MS: "60000",
      },
      async () => {
        await withGatewayServer(async ({ port }) => {
          const ws1 = await openWs(port);
          ws1.close();
          await waitForCloseInfo(ws1);

          const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
          ws2.on("error", () => {
            // asserted via close code
          });
          try {
            const closeInfo = await waitForCloseInfo(ws2);
            expect(closeInfo.code).toBe(1008);
            expect(closeInfo.reason).toContain("ws connect rate limit exceeded");
          } finally {
            ws2.close();
          }
        });
      },
    );
  });

  test("enforces queued request limits per connection", async () => {
    await withEnvAsync(
      {
        OPENCLAW_TEST_WS_MAX_QUEUED_MESSAGES_PER_CONNECTION: "1",
      },
      async () => {
        await withGatewayServer(async ({ port }) => {
          const ws = await openWs(port);
          try {
            const connect = await connectReq(ws);
            expect(connect.ok).toBe(true);

            for (let i = 0; i < 6; i += 1) {
              ws.send(
                JSON.stringify({
                  type: "req",
                  id: `q-${i}`,
                  method: "chat.send",
                  params: {
                    sessionKey: "main",
                    message: `queued message ${i}`,
                    idempotencyKey: `queued-${i}`,
                  },
                }),
              );
            }

            const closeInfo = await waitForCloseInfo(ws, 10_000);
            expect(closeInfo.code).toBe(1008);
            expect(closeInfo.reason).toContain("too many queued ws messages");
          } finally {
            ws.close();
          }
        });
      },
    );
  });

  test("enforces max websocket frame payload size", async () => {
    await withEnvAsync(
      {
        OPENCLAW_TEST_WS_MAX_PAYLOAD_BYTES: "512",
      },
      async () => {
        await withGatewayServer(async ({ port }) => {
          const ws = await openWs(port);
          try {
            ws.send("x".repeat(4_096));
            const closeInfo = await waitForCloseInfo(ws);
            expect(closeInfo.code).toBe(1009);
          } finally {
            ws.close();
          }
        });
      },
    );
  });
});
