import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCommandSpec } from "../../agents/skills.js";
import type { TemplateContext } from "../templating.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import { buildTestCtx } from "./test-ctx.js";
import type { TypingController } from "./typing.js";

const handleCommandsMock = vi.fn(async () => ({ shouldContinue: true }));
const toolExecute = vi.fn(async () => ({ content: "ok from tool" }));

vi.mock("./commands.js", () => ({
  handleCommands: handleCommandsMock,
  buildStatusReply: vi.fn(),
}));

vi.mock("../../agents/openclaw-tools.js", () => ({
  createOpenClawTools: () => [
    {
      name: "sessions_send",
      description: "send",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: toolExecute,
    },
  ],
}));

const { handleInlineActions } = await import("./get-reply-inline-actions.js");

function buildTyping(): TypingController {
  return {
    onReplyStart: async () => {},
    startTypingLoop: async () => {},
    startTypingOnText: async () => {},
    refreshTypingTtl: () => {},
    isActive: () => false,
    markRunComplete: () => {},
    markDispatchIdle: () => {},
    cleanup: vi.fn(),
  };
}

function buildSkillCommand(): SkillCommandSpec {
  return {
    name: "notify",
    skillName: "notify",
    description: "Notify via tool",
    dispatch: {
      kind: "tool",
      toolName: "sessions_send",
      argMode: "raw",
    },
  };
}

describe("handleInlineActions skill command tool dispatch policy", () => {
  beforeEach(() => {
    handleCommandsMock.mockClear();
    toolExecute.mockClear();
  });

  it("blocks deterministic tool dispatch when tools.deny blocks the target", async () => {
    const typing = buildTyping();
    const ctx = buildTestCtx({
      Body: "/notify hello",
      CommandBody: "/notify hello",
      CommandAuthorized: true,
      Surface: "whatsapp",
      Provider: "whatsapp",
    });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {
        tools: {
          deny: ["sessions_send"],
        },
      },
      agentId: "main",
      sessionKey: "agent:main:whatsapp:direct:+1555000",
      workspaceDir: "/tmp",
      isGroup: false,
      typing,
      allowTextCommands: true,
      inlineStatusRequested: false,
      command: {
        surface: "whatsapp",
        channel: "whatsapp",
        channelId: "whatsapp",
        ownerList: [],
        senderIsOwner: true,
        isAuthorizedSender: true,
        senderId: "+1555000",
        abortKey: "+1555000",
        rawBodyNormalized: "/notify hello",
        commandBodyNormalized: "/notify hello",
      },
      skillCommands: [buildSkillCommand()],
      directives: clearInlineDirectives("/notify hello"),
      cleanedBody: "/notify hello",
      elevatedEnabled: false,
      elevatedAllowed: false,
      elevatedFailures: [],
      defaultActivation: () => "always",
      resolvedThinkLevel: undefined,
      resolvedVerboseLevel: undefined,
      resolvedReasoningLevel: "off",
      resolvedElevatedLevel: "off",
      resolveDefaultThinkingLevel: async () => "off",
      provider: "openai",
      model: "gpt-4o-mini",
      contextTokens: 0,
      abortedLastRun: false,
      sessionScope: "per-sender",
    });

    expect(result).toEqual({
      kind: "reply",
      reply: { text: "❌ Tool not available: sessions_send" },
    });
    expect(toolExecute).not.toHaveBeenCalled();
    expect(typing.cleanup).toHaveBeenCalled();
  });

  it("allows deterministic tool dispatch when policy allows the target", async () => {
    const typing = buildTyping();
    const ctx = buildTestCtx({
      Body: "/notify hello",
      CommandBody: "/notify hello",
      CommandAuthorized: true,
      Surface: "whatsapp",
      Provider: "whatsapp",
    });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {
        tools: {
          allow: ["sessions_send"],
        },
      },
      agentId: "main",
      sessionKey: "agent:main:whatsapp:direct:+1555000",
      workspaceDir: "/tmp",
      isGroup: false,
      typing,
      allowTextCommands: true,
      inlineStatusRequested: false,
      command: {
        surface: "whatsapp",
        channel: "whatsapp",
        channelId: "whatsapp",
        ownerList: [],
        senderIsOwner: true,
        isAuthorizedSender: true,
        senderId: "+1555000",
        abortKey: "+1555000",
        rawBodyNormalized: "/notify hello",
        commandBodyNormalized: "/notify hello",
      },
      skillCommands: [buildSkillCommand()],
      directives: clearInlineDirectives("/notify hello"),
      cleanedBody: "/notify hello",
      elevatedEnabled: false,
      elevatedAllowed: false,
      elevatedFailures: [],
      defaultActivation: () => "always",
      resolvedThinkLevel: undefined,
      resolvedVerboseLevel: undefined,
      resolvedReasoningLevel: "off",
      resolvedElevatedLevel: "off",
      resolveDefaultThinkingLevel: async () => "off",
      provider: "openai",
      model: "gpt-4o-mini",
      contextTokens: 0,
      abortedLastRun: false,
      sessionScope: "per-sender",
    });

    expect(result).toEqual({
      kind: "reply",
      reply: { text: "ok from tool" },
    });
    expect(toolExecute).toHaveBeenCalledTimes(1);
    expect(typing.cleanup).toHaveBeenCalled();
  });
});
