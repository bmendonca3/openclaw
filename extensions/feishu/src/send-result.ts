export type FeishuMessageApiResponse = {
  code?: number;
  msg?: string;
  data?: {
    message_id?: string;
  };
};

const FEISHU_REPLY_TARGET_GONE_CODES = new Set([230011, 231003]);

export function getFeishuReplyTargetGoneCode(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const directCode = (value as { code?: number }).code;
  if (typeof directCode === "number" && FEISHU_REPLY_TARGET_GONE_CODES.has(directCode)) {
    return directCode;
  }

  const responseCode = (value as { response?: { data?: { code?: number } } }).response?.data?.code;
  if (typeof responseCode === "number" && FEISHU_REPLY_TARGET_GONE_CODES.has(responseCode)) {
    return responseCode;
  }

  return undefined;
}

export function isFeishuReplyTargetGone(value: unknown): boolean {
  return getFeishuReplyTargetGoneCode(value) !== undefined;
}

export function assertFeishuMessageApiSuccess(
  response: FeishuMessageApiResponse,
  errorPrefix: string,
) {
  if (response.code !== 0) {
    throw new Error(`${errorPrefix}: ${response.msg || `code ${response.code}`}`);
  }
}

export function toFeishuSendResult(
  response: FeishuMessageApiResponse,
  chatId: string,
): {
  messageId: string;
  chatId: string;
} {
  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId,
  };
}
