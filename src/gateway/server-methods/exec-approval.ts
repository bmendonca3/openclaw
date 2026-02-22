import type { ExecApprovalForwarder } from "../../infra/exec-approval-forwarder.js";
import {
  DEFAULT_EXEC_APPROVAL_TIMEOUT_MS,
  type ExecApprovalDecision,
} from "../../infra/exec-approvals.js";
import { safeEqualSecret } from "../../security/secret-equal.js";
import type { ExecApprovalManager } from "../exec-approval-manager.js";
import { GATEWAY_CLIENT_IDS } from "../protocol/client-info.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateExecApprovalRequestParams,
  validateExecApprovalResolveParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type CriticalApprovalPolicy = {
  enabled: boolean;
  requireControlUi: boolean;
  breakGlassEnv: string;
  env: NodeJS.ProcessEnv;
};

function resolveCriticalApprovalPolicy(opts?: {
  criticalApproval?: {
    enabled?: boolean;
    requireControlUi?: boolean;
    breakGlassEnv?: string;
    env?: NodeJS.ProcessEnv;
  };
}): CriticalApprovalPolicy {
  const raw = opts?.criticalApproval;
  const breakGlassEnv = raw?.breakGlassEnv?.trim() || "OPENCLAW_CRITICAL_APPROVAL_CODE";
  return {
    enabled: raw?.enabled === true,
    requireControlUi: raw?.requireControlUi !== false,
    breakGlassEnv,
    env: raw?.env ?? process.env,
  };
}

function isCriticalApprovalRequest(params: {
  host?: string | null;
  security?: string | null;
}): boolean {
  const host = params.host?.trim().toLowerCase();
  const security = params.security?.trim().toLowerCase();
  if (host !== "gateway" && host !== "node") {
    return false;
  }
  return security === "full";
}

export function createExecApprovalHandlers(
  manager: ExecApprovalManager,
  opts?: {
    forwarder?: ExecApprovalForwarder;
    criticalApproval?: {
      enabled?: boolean;
      requireControlUi?: boolean;
      breakGlassEnv?: string;
      env?: NodeJS.ProcessEnv;
    };
  },
): GatewayRequestHandlers {
  const criticalPolicy = resolveCriticalApprovalPolicy(opts);

  return {
    "exec.approval.request": async ({ params, respond, context, client }) => {
      if (!validateExecApprovalRequestParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid exec.approval.request params: ${formatValidationErrors(
              validateExecApprovalRequestParams.errors,
            )}`,
          ),
        );
        return;
      }
      const p = params as {
        id?: string;
        command: string;
        cwd?: string;
        host?: string;
        security?: string;
        ask?: string;
        agentId?: string;
        resolvedPath?: string;
        sessionKey?: string;
        timeoutMs?: number;
        twoPhase?: boolean;
      };
      const twoPhase = p.twoPhase === true;
      const timeoutMs =
        typeof p.timeoutMs === "number" ? p.timeoutMs : DEFAULT_EXEC_APPROVAL_TIMEOUT_MS;
      const explicitId = typeof p.id === "string" && p.id.trim().length > 0 ? p.id.trim() : null;
      if (explicitId && manager.getSnapshot(explicitId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approval id already pending"),
        );
        return;
      }
      const request = {
        command: p.command,
        cwd: p.cwd ?? null,
        host: p.host ?? null,
        security: p.security ?? null,
        ask: p.ask ?? null,
        agentId: p.agentId ?? null,
        resolvedPath: p.resolvedPath ?? null,
        sessionKey: p.sessionKey ?? null,
        critical: criticalPolicy.enabled
          ? isCriticalApprovalRequest({ host: p.host ?? null, security: p.security ?? null })
          : false,
      };
      const record = manager.create(request, timeoutMs, explicitId);
      record.requestedByConnId = client?.connId ?? null;
      record.requestedByDeviceId = client?.connect?.device?.id ?? null;
      record.requestedByClientId = client?.connect?.client?.id ?? null;
      // Use register() to synchronously add to pending map before sending any response.
      // This ensures the approval ID is valid immediately after the "accepted" response.
      let decisionPromise: Promise<
        import("../../infra/exec-approvals.js").ExecApprovalDecision | null
      >;
      try {
        decisionPromise = manager.register(record, timeoutMs);
      } catch (err) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `registration failed: ${String(err)}`),
        );
        return;
      }
      context.broadcast(
        "exec.approval.requested",
        {
          id: record.id,
          request: record.request,
          createdAtMs: record.createdAtMs,
          expiresAtMs: record.expiresAtMs,
        },
        { dropIfSlow: true },
      );
      void opts?.forwarder
        ?.handleRequested({
          id: record.id,
          request: record.request,
          createdAtMs: record.createdAtMs,
          expiresAtMs: record.expiresAtMs,
        })
        .catch((err) => {
          context.logGateway?.error?.(`exec approvals: forward request failed: ${String(err)}`);
        });

      // Only send immediate "accepted" response when twoPhase is requested.
      // This preserves single-response semantics for existing callers.
      if (twoPhase) {
        respond(
          true,
          {
            status: "accepted",
            id: record.id,
            createdAtMs: record.createdAtMs,
            expiresAtMs: record.expiresAtMs,
          },
          undefined,
        );
      }

      const decision = await decisionPromise;
      // Send final response with decision for callers using expectFinal:true.
      respond(
        true,
        {
          id: record.id,
          decision,
          createdAtMs: record.createdAtMs,
          expiresAtMs: record.expiresAtMs,
        },
        undefined,
      );
    },
    "exec.approval.waitDecision": async ({ params, respond }) => {
      const p = params as { id?: string };
      const id = typeof p.id === "string" ? p.id.trim() : "";
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
        return;
      }
      const decisionPromise = manager.awaitDecision(id);
      if (!decisionPromise) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approval expired or not found"),
        );
        return;
      }
      // Capture snapshot before await (entry may be deleted after grace period)
      const snapshot = manager.getSnapshot(id);
      const decision = await decisionPromise;
      // Return decision (can be null on timeout) - let clients handle via askFallback
      respond(
        true,
        {
          id,
          decision,
          createdAtMs: snapshot?.createdAtMs,
          expiresAtMs: snapshot?.expiresAtMs,
        },
        undefined,
      );
    },
    "exec.approval.resolve": async ({ params, respond, client, context }) => {
      if (!validateExecApprovalResolveParams(params)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid exec.approval.resolve params: ${formatValidationErrors(
              validateExecApprovalResolveParams.errors,
            )}`,
          ),
        );
        return;
      }
      const p = params as { id: string; decision: string; approvalCode?: string };
      const decision = p.decision as ExecApprovalDecision;
      if (decision !== "allow-once" && decision !== "allow-always" && decision !== "deny") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid decision"));
        return;
      }
      const snapshot = manager.getSnapshot(p.id);
      if (!snapshot) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown approval id"));
        return;
      }
      const requiresCriticalApproval =
        criticalPolicy.enabled &&
        snapshot.request?.critical === true &&
        (decision === "allow-once" || decision === "allow-always");
      if (requiresCriticalApproval) {
        if (
          criticalPolicy.requireControlUi &&
          client?.connect?.client?.id !== GATEWAY_CLIENT_IDS.CONTROL_UI
        ) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              "critical exec approvals must be resolved from Control UI",
            ),
          );
          return;
        }
        const expectedCodeRaw = criticalPolicy.env[criticalPolicy.breakGlassEnv];
        const expectedCode = typeof expectedCodeRaw === "string" ? expectedCodeRaw.trim() : "";
        if (!expectedCode) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `critical exec approvals require ${criticalPolicy.breakGlassEnv} to be set`,
            ),
          );
          return;
        }
        const providedCode = typeof p.approvalCode === "string" ? p.approvalCode.trim() : "";
        if (!providedCode || !safeEqualSecret(providedCode, expectedCode)) {
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              "invalid approvalCode for critical exec approval",
            ),
          );
          return;
        }
      }
      const resolvedBy = client?.connect?.client?.displayName ?? client?.connect?.client?.id;
      const ok = manager.resolve(p.id, decision, resolvedBy ?? null);
      if (!ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown approval id"));
        return;
      }
      context.broadcast(
        "exec.approval.resolved",
        { id: p.id, decision, resolvedBy, ts: Date.now() },
        { dropIfSlow: true },
      );
      void opts?.forwarder
        ?.handleResolved({ id: p.id, decision, resolvedBy, ts: Date.now() })
        .catch((err) => {
          context.logGateway?.error?.(`exec approvals: forward resolve failed: ${String(err)}`);
        });
      respond(true, { ok: true }, undefined);
    },
  };
}
