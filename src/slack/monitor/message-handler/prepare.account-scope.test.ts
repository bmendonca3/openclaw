import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { App } from "@slack/bolt";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../../config/config.js";
import {
  approveChannelPairingCode,
  listChannelPairingRequests,
} from "../../../pairing/pairing-store.js";
import type { RuntimeEnv } from "../../../runtime.js";
import type { ResolvedSlackAccount } from "../../accounts.js";
import type { SlackMessageEvent } from "../../types.js";
import { createSlackMonitorContext, type SlackMonitorContext } from "../context.js";
import { prepareSlackMessage } from "./prepare.js";

function createTestContext(accountId: string): SlackMonitorContext {
  const ctx = createSlackMonitorContext({
    cfg: { channels: { slack: { enabled: true } } } as OpenClawConfig,
    accountId,
    botToken: "xoxb-test-token",
    app: { client: {} } as App,
    runtime: {} as RuntimeEnv,
    botUserId: "B-BOT",
    teamId: "T-TEAM",
    apiAppId: "A-APP",
    historyLimit: 0,
    sessionScope: "per-sender",
    mainKey: "main",
    dmEnabled: true,
    dmPolicy: "pairing",
    allowFrom: [],
    allowNameMatching: false,
    groupDmEnabled: false,
    groupDmChannels: [],
    defaultRequireMention: true,
    groupPolicy: "open",
    useAccessGroups: false,
    reactionMode: "off",
    reactionAllowlist: [],
    replyToMode: "off",
    threadHistoryScope: "thread",
    threadInheritParent: false,
    slashCommand: {
      enabled: true,
      name: "openclaw",
      sessionPrefix: "slack:slash",
      ephemeral: true,
    },
    textLimit: 4000,
    ackReactionScope: "group-mentions",
    mediaMaxBytes: 1024,
    removeAckAfterReply: false,
  });
  ctx.resolveUserName = async () => ({ name: "Mallory" });
  return ctx;
}

function createTestAccount(accountId: string): ResolvedSlackAccount {
  return {
    accountId,
    enabled: true,
    botTokenSource: "config",
    appTokenSource: "config",
    config: {},
  };
}

function createDmEvent(params: { senderId: string; ts: string }): SlackMessageEvent {
  return {
    channel: "D123",
    channel_type: "im",
    user: params.senderId,
    text: "hi",
    ts: params.ts,
  } as SlackMessageEvent;
}

describe("prepareSlackMessage pairing-store account scope", () => {
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  let tempStateDir: string | null = null;

  afterEach(() => {
    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }
    if (tempStateDir) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
      tempStateDir = null;
    }
  });

  it("stores and approves Slack DM pairing requests under the active account scope", async () => {
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-slack-pairing-scope-"));
    process.env.OPENCLAW_STATE_DIR = tempStateDir;

    const accountId = "acct-work";
    const senderId = "U_ATTACKER";
    const ctx = createTestContext(accountId);
    const account = createTestAccount(accountId);

    const firstResult = await prepareSlackMessage({
      ctx,
      account,
      message: createDmEvent({ senderId, ts: "1.000" }),
      opts: { source: "message" },
    });

    expect(firstResult).toBeNull();

    const pendingAll = await listChannelPairingRequests("slack", process.env);
    expect(pendingAll).toHaveLength(1);
    expect(pendingAll[0]?.meta?.accountId).toBe(accountId);

    const pendingScoped = await listChannelPairingRequests("slack", process.env, accountId);
    expect(pendingScoped).toHaveLength(1);
    const code = pendingScoped[0]?.code ?? "";
    expect(code).not.toHaveLength(0);

    const approved = await approveChannelPairingCode({
      channel: "slack",
      code,
      accountId,
      env: process.env,
    });
    expect(approved?.id).toBe(senderId);

    const secondResult = await prepareSlackMessage({
      ctx,
      account,
      message: createDmEvent({ senderId, ts: "2.000" }),
      opts: { source: "message" },
    });

    expect(secondResult).toBeTruthy();
  });
});
