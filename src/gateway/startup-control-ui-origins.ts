import type { OpenClawConfig } from "../config/config.js";
import {
  ensureControlUiAllowedOriginsForNonLoopbackBind,
  type GatewayNonLoopbackBindMode,
} from "../config/gateway-control-ui-origins.js";
import { ConfigWriteConflictError } from "../config/io.js";

export async function maybeSeedControlUiAllowedOriginsAtStartup(params: {
  config: OpenClawConfig;
  configPath?: string;
  writeConfig: (config: OpenClawConfig) => Promise<void>;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<OpenClawConfig> {
  const seeded = ensureControlUiAllowedOriginsForNonLoopbackBind(params.config);
  if (!seeded.seededOrigins || !seeded.bind) {
    return params.config;
  }
  try {
    await params.writeConfig(seeded.config);
    params.log.info(buildSeededOriginsInfoLog(seeded.seededOrigins, seeded.bind));
  } catch (err) {
    if (err instanceof ConfigWriteConflictError) {
      params.log.warn(
        `gateway: skipped gateway.controlUi.allowedOrigins seed because ${params.configPath ?? err.configPath} changed on disk during startup.`,
      );
      return seeded.config;
    }
    params.log.warn(
      `gateway: failed to persist gateway.controlUi.allowedOrigins seed: ${String(err)}. The gateway will start with the in-memory value but config was not saved.`,
    );
  }
  return seeded.config;
}

function buildSeededOriginsInfoLog(origins: string[], bind: GatewayNonLoopbackBindMode): string {
  return (
    `gateway: seeded gateway.controlUi.allowedOrigins ${JSON.stringify(origins)} ` +
    `for bind=${bind} (required since v2026.2.26; see issue #29385). ` +
    "Add other origins to gateway.controlUi.allowedOrigins if needed."
  );
}
