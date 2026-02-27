import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMediaFeishuMock = vi.hoisted(() => vi.fn());
const sendMessageFeishuMock = vi.hoisted(() => vi.fn());

vi.mock("./media.js", () => ({
  sendMediaFeishu: sendMediaFeishuMock,
}));

vi.mock("./send.js", () => ({
  sendMessageFeishu: sendMessageFeishuMock,
}));

vi.mock("./runtime.js", () => ({
  getFeishuRuntime: () => ({
    channel: {
      text: {
        chunkMarkdownText: vi.fn((text: string) => [text]),
      },
    },
  }),
}));

import { feishuOutbound } from "./outbound.js";

describe("feishuOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMediaFeishuMock.mockResolvedValue({ messageId: "msg_1", chatId: "chat_1" });
    sendMessageFeishuMock.mockResolvedValue({ messageId: "msg_text", chatId: "chat_1" });
  });

  it("forwards mediaLocalRoots to sendMediaFeishu", async () => {
    const mediaLocalRoots = ["/tmp/workspace-clawdy"];

    await feishuOutbound.sendMedia!({
      cfg: {} as never,
      to: "user:ou_target",
      text: "",
      mediaUrl: "/tmp/workspace-clawdy/tmp/render.bin",
      mediaLocalRoots,
    });

    expect(sendMediaFeishuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: "/tmp/workspace-clawdy/tmp/render.bin",
        localRoots: mediaLocalRoots,
      }),
    );
  });

  it("falls back to a link when media upload fails", async () => {
    sendMediaFeishuMock.mockRejectedValueOnce(new Error("blocked"));

    await feishuOutbound.sendMedia!({
      cfg: {} as never,
      to: "user:ou_target",
      text: "",
      mediaUrl: "/tmp/workspace-clawdy/tmp/render.bin",
      mediaLocalRoots: ["/tmp/workspace-clawdy"],
    });

    expect(sendMessageFeishuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "📎 /tmp/workspace-clawdy/tmp/render.bin",
      }),
    );
  });
});
