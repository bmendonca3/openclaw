import type { QueueSettings } from "./queue.js";

export type ActiveRunQueueAction = "run-now" | "enqueue-followup" | "drop";

export function resolveActiveRunQueueAction(params: {
  isActive: boolean;
  isHeartbeat: boolean;
  hasQueuedSystemPrompt?: boolean;
  shouldFollowup: boolean;
  queueMode: QueueSettings["mode"];
}): ActiveRunQueueAction {
  if (!params.isActive) {
    return "run-now";
  }
  if (params.isHeartbeat) {
    // Preserve heartbeat-triggered runs when they carry queued system events
    // (for example exec approval terminal outcomes) so they are not lost.
    if (params.hasQueuedSystemPrompt) {
      return "enqueue-followup";
    }
    return "drop";
  }
  if (params.shouldFollowup || params.queueMode === "steer") {
    return "enqueue-followup";
  }
  return "run-now";
}
