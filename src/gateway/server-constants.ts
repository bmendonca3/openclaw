// Keep server maxPayload aligned with gateway client maxPayload so high-res canvas snapshots
// don't get disconnected mid-invoke with "Max payload size exceeded".
export const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_BUFFERED_BYTES = 50 * 1024 * 1024; // per-connection send buffer limit (2x max payload)
export const DEFAULT_WS_MAX_PAYLOAD_BYTES = MAX_PAYLOAD_BYTES;
export const DEFAULT_WS_MAX_QUEUED_MESSAGES_PER_CONNECTION = 64;
export const DEFAULT_WS_MAX_CONNECTIONS_PER_IP = 24;
export const DEFAULT_WS_CONNECT_RATE_LIMIT_MAX_ATTEMPTS = 40;
export const DEFAULT_WS_CONNECT_RATE_LIMIT_WINDOW_MS = 10_000;

const DEFAULT_MAX_CHAT_HISTORY_MESSAGES_BYTES = 6 * 1024 * 1024; // keep history responses comfortably under client WS limits
let maxChatHistoryMessagesBytes = DEFAULT_MAX_CHAT_HISTORY_MESSAGES_BYTES;

export const getMaxChatHistoryMessagesBytes = () => maxChatHistoryMessagesBytes;

export const __setMaxChatHistoryMessagesBytesForTest = (value?: number) => {
  if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    return;
  }
  if (value === undefined) {
    maxChatHistoryMessagesBytes = DEFAULT_MAX_CHAT_HISTORY_MESSAGES_BYTES;
    return;
  }
  if (Number.isFinite(value) && value > 0) {
    maxChatHistoryMessagesBytes = value;
  }
};
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
export const getHandshakeTimeoutMs = () => {
  if (process.env.VITEST && process.env.OPENCLAW_TEST_HANDSHAKE_TIMEOUT_MS) {
    const parsed = Number(process.env.OPENCLAW_TEST_HANDSHAKE_TIMEOUT_MS);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_HANDSHAKE_TIMEOUT_MS;
};
export const TICK_INTERVAL_MS = 30_000;
export const HEALTH_REFRESH_INTERVAL_MS = 60_000;
export const DEDUPE_TTL_MS = 5 * 60_000;
export const DEDUPE_MAX = 1000;

function resolvePositiveIntFromTestEnv(
  envKey: string,
  fallback: number,
  maxValue = Number.MAX_SAFE_INTEGER,
): number {
  if (!process.env.VITEST) {
    return fallback;
  }
  const raw = process.env[envKey];
  if (!raw || !raw.trim()) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), maxValue);
}

export const getWsMaxQueuedMessagesPerConnection = () =>
  resolvePositiveIntFromTestEnv(
    "OPENCLAW_TEST_WS_MAX_QUEUED_MESSAGES_PER_CONNECTION",
    DEFAULT_WS_MAX_QUEUED_MESSAGES_PER_CONNECTION,
    4096,
  );

export const getWsMaxPayloadBytes = () =>
  resolvePositiveIntFromTestEnv(
    "OPENCLAW_TEST_WS_MAX_PAYLOAD_BYTES",
    DEFAULT_WS_MAX_PAYLOAD_BYTES,
    100 * 1024 * 1024,
  );

export const getWsMaxConnectionsPerIp = () =>
  resolvePositiveIntFromTestEnv(
    "OPENCLAW_TEST_WS_MAX_CONNECTIONS_PER_IP",
    DEFAULT_WS_MAX_CONNECTIONS_PER_IP,
    10_000,
  );

export const getWsConnectRateLimitMaxAttempts = () =>
  resolvePositiveIntFromTestEnv(
    "OPENCLAW_TEST_WS_CONNECT_RATE_LIMIT_MAX_ATTEMPTS",
    DEFAULT_WS_CONNECT_RATE_LIMIT_MAX_ATTEMPTS,
    100_000,
  );

export const getWsConnectRateLimitWindowMs = () =>
  resolvePositiveIntFromTestEnv(
    "OPENCLAW_TEST_WS_CONNECT_RATE_LIMIT_WINDOW_MS",
    DEFAULT_WS_CONNECT_RATE_LIMIT_WINDOW_MS,
    10 * 60_000,
  );
