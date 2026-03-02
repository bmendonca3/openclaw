import { chunkTextWithMode, resolveChunkMode } from "../../auto-reply/chunk.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import { loadConfig } from "../../config/config.js";
import { resolveMarkdownTableMode } from "../../config/markdown-tables.js";
import { convertMarkdownTables } from "../../markdown/tables.js";
import type { RuntimeEnv } from "../../runtime.js";
import type { createIMessageRpcClient } from "../client.js";
import { sendMessageIMessage } from "../send.js";
import { normalizeIMessageHandle, parseIMessageTarget } from "../targets.js";
import type { SentMessageCache } from "./echo-cache.js";

function buildSentMessageScope(accountId: string | undefined, target: string): string {
  const parsedTarget = parseIMessageTarget(target);
  if (parsedTarget.kind === "chat_id") {
    return `${accountId ?? ""}:chat_id:${parsedTarget.chatId}`;
  }
  if (parsedTarget.kind === "chat_guid") {
    return `${accountId ?? ""}:chat_guid:${parsedTarget.chatGuid}`;
  }
  if (parsedTarget.kind === "chat_identifier") {
    return `${accountId ?? ""}:chat_identifier:${parsedTarget.chatIdentifier}`;
  }
  return `${accountId ?? ""}:imessage:${normalizeIMessageHandle(parsedTarget.to)}`;
}

export async function deliverReplies(params: {
  replies: ReplyPayload[];
  target: string;
  client: Awaited<ReturnType<typeof createIMessageRpcClient>>;
  accountId?: string;
  runtime: RuntimeEnv;
  maxBytes: number;
  textLimit: number;
  sentMessageCache?: Pick<SentMessageCache, "remember">;
}) {
  const { replies, target, client, runtime, maxBytes, textLimit, accountId, sentMessageCache } =
    params;
  const scope = buildSentMessageScope(accountId, target);
  const cfg = loadConfig();
  const tableMode = resolveMarkdownTableMode({
    cfg,
    channel: "imessage",
    accountId,
  });
  const chunkMode = resolveChunkMode(cfg, "imessage", accountId);
  for (const payload of replies) {
    const mediaList = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
    const rawText = payload.text ?? "";
    const text = convertMarkdownTables(rawText, tableMode);
    if (!text && mediaList.length === 0) {
      continue;
    }
    if (mediaList.length === 0) {
      sentMessageCache?.remember(scope, { text });
      for (const chunk of chunkTextWithMode(text, textLimit, chunkMode)) {
        const sent = await sendMessageIMessage(target, chunk, {
          maxBytes,
          client,
          accountId,
          replyToId: payload.replyToId,
        });
        sentMessageCache?.remember(scope, { text: chunk, messageId: sent.messageId });
      }
    } else {
      let first = true;
      for (const url of mediaList) {
        const caption = first ? text : "";
        first = false;
        const sent = await sendMessageIMessage(target, caption, {
          mediaUrl: url,
          maxBytes,
          client,
          accountId,
          replyToId: payload.replyToId,
        });
        sentMessageCache?.remember(scope, {
          text: caption || undefined,
          messageId: sent.messageId,
        });
      }
    }
    runtime.log?.(`imessage: delivered reply to ${target}`);
  }
}
