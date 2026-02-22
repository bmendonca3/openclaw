import { describe, expect, it, vi } from "vitest";
import type { SkillCommandSpec } from "../../agents/skills.js";
import type { TemplateContext } from "../templating.js";
import { clearInlineDirectives } from "./get-reply-directives-utils.js";
import { buildTestCtx } from "./test-ctx.js";
import type { TypingController } from "./typing.js";

const handleCommandsMock = vi.fn();
const createOpenClawToolsMock = vi.fn();

vi.mock("./commands.js", () => ({
  handleCommands: (...args: unknown[]) => handleCommandsMock(...args),
  buildStatusReply: vi.fn(),
  buildCommandContext: vi.fn(),
}));

vi.mock("../../agents/openclaw-tools.js", () => ({
  createOpenClawTools: (...args: unknown[]) => createOpenClawToolsMock(...args),
}));

const { handleInlineActions } = await import("./get-reply-inline-actions.js");

function createTypingController(): TypingController {
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

function createSkillDispatchCommand(toolName: string): SkillCommandSpec {
  return {
    name: "audit",
    skillName: "audit-skill",
    description: "Audit skill",
    dispatch: {
      kind: "tool",
      toolName,
      argMode: "raw",
    },
  };
}

describe("handleInlineActions skill dispatch allowlist", () => {
  it("blocks deterministic tool dispatch by default when allowlist is unset", async () => {
    createOpenClawToolsMock.mockReset();
    handleCommandsMock.mockReset();
    const typing = createTypingController();
    const ctx = buildTestCtx({ Body: "/audit hello world" });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {},
      agentId: "main",
      sessionKey: "agent:main:main",
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
        senderId: "user-1",
        abortKey: "whatsapp:+1000",
        rawBodyNormalized: "/audit hello world",
        commandBodyNormalized: "/audit hello world",
        from: "whatsapp:+1000",
        to: "whatsapp:+2000",
      },
      directives: clearInlineDirectives("/audit hello world"),
      cleanedBody: "/audit hello world",
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
      skillCommands: [createSkillDispatchCommand("sessions_send")],
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.reply).toEqual({
        text: "❌ Skill dispatch blocked by config for tool: sessions_send",
      });
    }
    expect(createOpenClawToolsMock).not.toHaveBeenCalled();
    expect(handleCommandsMock).not.toHaveBeenCalled();
  });

  it("allows deterministic dispatch when tool is explicitly allowlisted", async () => {
    createOpenClawToolsMock.mockReset();
    handleCommandsMock.mockReset();
    const execute = vi.fn(async () => ({ content: "sent ok" }));
    createOpenClawToolsMock.mockReturnValue([{ name: "sessions_send", execute }]);

    const typing = createTypingController();
    const ctx = buildTestCtx({ Body: "/audit hello world" });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {
        skills: {
          commandDispatch: {
            allowTools: ["sessions_send"],
          },
        },
      },
      agentId: "main",
      sessionKey: "agent:main:main",
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
        senderId: "user-1",
        abortKey: "whatsapp:+1000",
        rawBodyNormalized: "/audit hello world",
        commandBodyNormalized: "/audit hello world",
        from: "whatsapp:+1000",
        to: "whatsapp:+2000",
      },
      directives: clearInlineDirectives("/audit hello world"),
      cleanedBody: "/audit hello world",
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
      skillCommands: [createSkillDispatchCommand("sessions_send")],
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.reply).toEqual({ text: "sent ok" });
    }
    expect(execute).toHaveBeenCalledTimes(1);
    expect(handleCommandsMock).not.toHaveBeenCalled();
  });

  it("blocks dispatch to tools that are not in allowTools", async () => {
    createOpenClawToolsMock.mockReset();
    handleCommandsMock.mockReset();
    const execute = vi.fn(async () => ({ content: "should not run" }));
    createOpenClawToolsMock.mockReturnValue([{ name: "exec", execute }]);

    const typing = createTypingController();
    const ctx = buildTestCtx({ Body: "/audit whoami" });

    const result = await handleInlineActions({
      ctx,
      sessionCtx: ctx as unknown as TemplateContext,
      cfg: {
        skills: {
          commandDispatch: {
            allowTools: ["sessions_send"],
          },
        },
      },
      agentId: "main",
      sessionKey: "agent:main:main",
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
        senderId: "user-1",
        abortKey: "whatsapp:+1000",
        rawBodyNormalized: "/audit whoami",
        commandBodyNormalized: "/audit whoami",
        from: "whatsapp:+1000",
        to: "whatsapp:+2000",
      },
      directives: clearInlineDirectives("/audit whoami"),
      cleanedBody: "/audit whoami",
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
      skillCommands: [createSkillDispatchCommand("exec")],
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.reply).toEqual({ text: "❌ Skill dispatch blocked by config for tool: exec" });
    }
    expect(createOpenClawToolsMock).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(handleCommandsMock).not.toHaveBeenCalled();
  });
});
