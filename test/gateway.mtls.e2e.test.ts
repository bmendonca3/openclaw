import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { WebSocket, type ClientOptions } from "ws";
import {
  connectReq,
  getFreePort,
  installGatewayTestHooks,
  startGatewayServer,
} from "../src/gateway/test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

function fixturePath(name: string): string {
  return path.join(process.cwd(), "test", "fixtures", "gateway-mtls", name);
}

async function configureGatewayTls(): Promise<void> {
  const configPath = process.env.OPENCLAW_CONFIG_PATH;
  if (!configPath) {
    throw new Error("OPENCLAW_CONFIG_PATH is not set in gateway test environment");
  }

  const raw = await fs.readFile(configPath, "utf8").catch(() => "{}");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const gateway =
    parsed.gateway && typeof parsed.gateway === "object" && !Array.isArray(parsed.gateway)
      ? { ...(parsed.gateway as Record<string, unknown>) }
      : {};

  gateway.tls = {
    enabled: true,
    autoGenerate: false,
    certPath: fixturePath("server-cert.pem"),
    keyPath: fixturePath("server-key.pem"),
    clientCaPath: fixturePath("ca-cert.pem"),
  };

  parsed.gateway = gateway;
  await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

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

describe("gateway mTLS", () => {
  afterEach(async () => {
    // Remove explicit TLS config between tests to avoid cross-test coupling.
    const configPath = process.env.OPENCLAW_CONFIG_PATH;
    if (!configPath) {
      return;
    }
    const raw = await fs.readFile(configPath, "utf8").catch(() => "{}");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.gateway && typeof parsed.gateway === "object" && !Array.isArray(parsed.gateway)) {
      const gateway = { ...(parsed.gateway as Record<string, unknown>) };
      delete gateway.tls;
      parsed.gateway = gateway;
      await fs.writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    }
  });

  test("requires client cert on non-loopback TLS gateway when clientCaPath is configured", async () => {
    await configureGatewayTls();
    const port = await getFreePort();
    const server = await startGatewayServer(port, { bind: "lan", controlUiEnabled: false });

    try {
      const baseOptions: ClientOptions = { rejectUnauthorized: false };
      await expect(openSocket(`wss://127.0.0.1:${port}`, baseOptions)).rejects.toBeDefined();

      const cert = await fs.readFile(fixturePath("client-cert.pem"), "utf8");
      const key = await fs.readFile(fixturePath("client-key.pem"), "utf8");
      const ws = await openSocket(`wss://127.0.0.1:${port}`, {
        ...baseOptions,
        cert,
        key,
      });
      try {
        const res = await connectReq(ws);
        expect(res.ok).toBe(true);
      } finally {
        await closeSocket(ws);
      }
    } finally {
      await server.close();
    }
  });
});
