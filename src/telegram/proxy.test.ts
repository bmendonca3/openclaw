import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  EnvHttpProxyAgent,
  ProxyAgent,
  undiciFetch,
  proxyAgentSpy,
  envProxyAgentSpy,
  getLastAgent,
} = vi.hoisted(() => {
  const undiciFetch = vi.fn();
  const proxyAgentSpy = vi.fn();
  const envProxyAgentSpy = vi.fn();
  class ProxyAgent {
    static lastCreated: ProxyAgent | undefined;
    proxyUrl: string;
    constructor(proxyUrl: string) {
      this.proxyUrl = proxyUrl;
      ProxyAgent.lastCreated = this;
      proxyAgentSpy(proxyUrl);
    }
  }

  class EnvHttpProxyAgent {
    static lastCreated: EnvHttpProxyAgent | undefined;
    constructor() {
      EnvHttpProxyAgent.lastCreated = this;
      envProxyAgentSpy();
    }
  }

  return {
    EnvHttpProxyAgent,
    ProxyAgent,
    undiciFetch,
    proxyAgentSpy,
    envProxyAgentSpy,
    getLastAgent: () => ProxyAgent.lastCreated,
  };
});

vi.mock("undici", () => ({
  EnvHttpProxyAgent,
  ProxyAgent,
  fetch: undiciFetch,
}));

import { makeEnvProxyFetch, makeProxyFetch, resolveTelegramProxyFetch } from "./proxy.js";

beforeEach(() => {
  undiciFetch.mockReset();
  proxyAgentSpy.mockClear();
  envProxyAgentSpy.mockClear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("makeProxyFetch", () => {
  it("uses undici fetch with ProxyAgent dispatcher", async () => {
    const proxyUrl = "http://proxy.test:8080";
    undiciFetch.mockResolvedValue({ ok: true });

    const proxyFetch = makeProxyFetch(proxyUrl);
    await proxyFetch("https://api.telegram.org/bot123/getMe");

    expect(proxyAgentSpy).toHaveBeenCalledWith(proxyUrl);
    expect(undiciFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123/getMe",
      expect.objectContaining({ dispatcher: getLastAgent() }),
    );
  });
});

describe("makeEnvProxyFetch", () => {
  it("uses EnvHttpProxyAgent when proxy env is configured", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.test:8080");
    undiciFetch.mockResolvedValue({ ok: true });

    const proxyFetch = makeEnvProxyFetch();
    expect(proxyFetch).toBeTypeOf("function");

    await proxyFetch?.("https://api.telegram.org/bot123/getMe");

    expect(envProxyAgentSpy).toHaveBeenCalledOnce();
    expect(undiciFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123/getMe",
      expect.objectContaining({ dispatcher: EnvHttpProxyAgent.lastCreated }),
    );
  });

  it("returns undefined when no proxy env is configured", () => {
    vi.unstubAllEnvs();

    expect(makeEnvProxyFetch()).toBeUndefined();
  });
});

describe("resolveTelegramProxyFetch", () => {
  it("prefers explicit proxy config over env proxy", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://env-proxy.test:8080");
    undiciFetch.mockResolvedValue({ ok: true });

    const proxyFetch = resolveTelegramProxyFetch("http://config-proxy.test:8080");
    await proxyFetch?.("https://api.telegram.org/bot123/getMe");

    expect(proxyAgentSpy).toHaveBeenCalledWith("http://config-proxy.test:8080");
    expect(envProxyAgentSpy).not.toHaveBeenCalled();
  });
});
