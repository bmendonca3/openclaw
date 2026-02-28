import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveFeishuSendTargetMock = vi.hoisted(() => vi.fn());
const getFeishuRuntimeMock = vi.hoisted(() => vi.fn());

const replyMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("./send-target.js", () => ({
  resolveFeishuSendTarget: resolveFeishuSendTargetMock,
}));

vi.mock("./runtime.js", () => ({
  getFeishuRuntime: getFeishuRuntimeMock,
}));

import { sendCardFeishu, sendMessageFeishu } from "./send.js";

describe("Feishu reply fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replyMock.mockResolvedValue({ code: 230011, msg: "The message was withdrawn." });
    createMock.mockResolvedValue({ code: 0, data: { message_id: "m_fallback" } });
    resolveFeishuSendTargetMock.mockReturnValue({
      client: {
        im: {
          message: {
            reply: replyMock,
            create: createMock,
          },
        },
      },
      receiveId: "ou_user",
      receiveIdType: "open_id",
    });
    getFeishuRuntimeMock.mockReturnValue({
      channel: {
        text: {
          resolveMarkdownTableMode: vi.fn(() => "preserve"),
          convertMarkdownTables: vi.fn((text: string) => text),
        },
      },
    });
  });

  it("falls back to a direct send when a text reply target was withdrawn", async () => {
    await expect(
      sendMessageFeishu({
        cfg: {} as never,
        to: "user:ou_user",
        text: "hello",
        replyToMessageId: "om_deleted",
      }),
    ).resolves.toEqual({ messageId: "m_fallback", chatId: "ou_user" });

    expect(replyMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct send when a card reply target was deleted", async () => {
    await expect(
      sendCardFeishu({
        cfg: {} as never,
        to: "user:ou_user",
        card: { schema: "2.0", elements: [] },
        replyToMessageId: "om_deleted",
      }),
    ).resolves.toEqual({ messageId: "m_fallback", chatId: "ou_user" });

    expect(replyMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
