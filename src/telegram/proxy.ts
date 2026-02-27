import { EnvHttpProxyAgent, ProxyAgent, fetch as undiciFetch } from "undici";

const ENV_PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;

function makeDispatcherFetch(dispatcher: ProxyAgent | EnvHttpProxyAgent): typeof fetch {
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as string | URL, {
      ...(init as Record<string, unknown>),
      dispatcher,
    }) as unknown as Promise<Response>) as typeof fetch;
  return fetcher;
}

export function makeProxyFetch(proxyUrl: string): typeof fetch {
  const agent = new ProxyAgent(proxyUrl);
  // Return raw proxy fetch; call sites that need AbortSignal normalization
  // should opt into resolveFetch/wrapFetchWithAbortSignal once at the edge.
  return makeDispatcherFetch(agent);
}

function hasEnvProxyConfigured(): boolean {
  return ENV_PROXY_KEYS.some((key) => {
    const value = process.env[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function makeEnvProxyFetch(): typeof fetch | undefined {
  if (!hasEnvProxyConfigured()) {
    return undefined;
  }
  return makeDispatcherFetch(new EnvHttpProxyAgent());
}

export function resolveTelegramProxyFetch(proxyUrl?: string): typeof fetch | undefined {
  const trimmedProxyUrl = proxyUrl?.trim();
  if (trimmedProxyUrl) {
    return makeProxyFetch(trimmedProxyUrl);
  }
  return makeEnvProxyFetch();
}
