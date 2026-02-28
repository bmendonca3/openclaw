import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveFeishuAccountMock = vi.hoisted(() => vi.fn());
const createFeishuClientMock = vi.hoisted(() => vi.fn());
const getFeishuRuntimeMock = vi.hoisted(() => vi.fn());
const reactionCreateMock = vi.hoisted(() => vi.fn());
const reactionDeleteMock = vi.hoisted(() => vi.fn());

vi.mock("./accounts.js", () => ({
  resolveFeishuAccount: resolveFeishuAccountMock,
}));

vi.mock("./client.js", () => ({
  createFeishuClient: createFeishuClientMock,
}));

vi.mock("./runtime.js", () => ({
  getFeishuRuntime: getFeishuRuntimeMock,
}));

import { addTypingIndicator, removeTypingIndicator } from "./typing.js";

describe("Feishu typing target-gone handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveFeishuAccountMock.mockReturnValue({
      configured: true,
      accountId: "main",
      config: {},
      appId: "app_id",
      appSecret: "app_secret",
      domain: "feishu",
    });
    createFeishuClientMock.mockReturnValue({
      im: {
        messageReaction: {
          create: reactionCreateMock,
          delete: reactionDeleteMock,
        },
      },
    });
    getFeishuRuntimeMock.mockReturnValue({
      logging: {
        shouldLogVerbose: () => true,
      },
    });
  });

  it("throws when add typing hits a deleted message so keepalive can stop", async () => {
    reactionCreateMock.mockResolvedValue({ code: 231003, msg: "The message is not found" });

    await expect(
      addTypingIndicator({
        cfg: {} as never,
        messageId: "om_deleted",
        runtime: { log: vi.fn() } as never,
      }),
    ).rejects.toMatchObject({ code: 231003 });
  });

  it("throws when removing typing hits a withdrawn message", async () => {
    reactionDeleteMock.mockResolvedValue({ code: 230011, msg: "The message was withdrawn." });

    await expect(
      removeTypingIndicator({
        cfg: {} as never,
        state: { messageId: "om_deleted", reactionId: "reaction_1" },
        runtime: { log: vi.fn() } as never,
      }),
    ).rejects.toMatchObject({ code: 230011 });
  });
});
