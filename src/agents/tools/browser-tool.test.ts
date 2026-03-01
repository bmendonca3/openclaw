import { afterEach, describe, expect, it, vi } from "vitest";

const browserClientMocks = vi.hoisted(() => ({
  browserOpenTab: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserProfiles: vi.fn(async (..._args: unknown[]) => []),
  browserStart: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserStatus: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserStop: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserTabs: vi.fn(async (..._args: unknown[]) => []),
  browserCloseTab: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserFocusTab: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  browserSnapshot: vi.fn(async (..._args: unknown[]) => ({ ok: true, format: "ai", snapshot: "" })),
}));
vi.mock("../../browser/client.js", () => browserClientMocks);

const browserActionsMocks = vi.hoisted(() => ({
  browserAct: vi.fn(async () => ({ ok: true })),
  browserArmDialog: vi.fn(async () => ({ ok: true })),
  browserArmFileChooser: vi.fn(async () => ({ ok: true })),
  browserConsoleMessages: vi.fn(async () => ({ ok: true, targetId: "t1", messages: [] })),
  browserNavigate: vi.fn(async () => ({ ok: true })),
  browserPdfSave: vi.fn(async () => ({ ok: true, path: "/tmp/test.pdf" })),
  browserScreenshotAction: vi.fn(async () => ({ ok: true, path: "/tmp/test.png" })),
}));
vi.mock("../../browser/client-actions.js", () => browserActionsMocks);

vi.mock("../../browser/config.js", () => ({
  resolveBrowserConfig: vi.fn(() => ({ enabled: true, controlPort: 18791 })),
}));

vi.mock("./nodes-utils.js", async () => {
  const actual = await vi.importActual<typeof import("./nodes-utils.js")>("./nodes-utils.js");
  return {
    ...actual,
    listNodes: vi.fn(async () => []),
  };
});

vi.mock("./gateway.js", () => ({
  callGatewayTool: vi.fn(async () => ({
    ok: true,
    payload: { result: { ok: true } },
  })),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({ browser: {} })),
}));

import { createBrowserTool } from "./browser-tool.js";

describe("browser tool url aliases", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts url for open action", async () => {
    const tool = createBrowserTool();
    const result = await tool.execute?.("call-1", {
      action: "open",
      url: "https://example.com",
    });

    expect(browserClientMocks.browserOpenTab).toHaveBeenCalledWith(
      undefined,
      "https://example.com",
      expect.objectContaining({ profile: undefined }),
    );
    expect(result?.details).toMatchObject({ ok: true });
  });

  it("accepts url for navigate action", async () => {
    const tool = createBrowserTool();
    const result = await tool.execute?.("call-1", {
      action: "navigate",
      url: "https://example.com/path",
    });

    expect(browserActionsMocks.browserNavigate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        url: "https://example.com/path",
        targetId: undefined,
        profile: undefined,
      }),
    );
    expect(result?.details).toMatchObject({ ok: true });
  });
});
