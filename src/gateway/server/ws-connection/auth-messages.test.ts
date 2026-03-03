import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  formatControlUiDeviceIdentityRequiredCloseReason,
  formatControlUiDeviceIdentityRequiredMessage,
} from "./auth-messages.js";

describe("formatControlUiDeviceIdentityRequiredMessage", () => {
  it("returns actionable guidance for insecure control-ui connections", () => {
    const message = formatControlUiDeviceIdentityRequiredMessage();
    expect(message).toContain("control ui requires device identity");
    expect(message).toContain("HTTPS/WSS on remote hosts");
    expect(message).toContain("localhost secure context");
    expect(message).toContain("gateway.controlUi.allowInsecureAuth=true");
  });

  it("returns a close reason that fits within websocket limits", () => {
    const closeReason = formatControlUiDeviceIdentityRequiredCloseReason();
    expect(closeReason).toContain("control ui requires device identity");
    expect(closeReason).toContain("gateway.controlUi.allowInsecureAuth=true");
    expect(Buffer.byteLength(closeReason, "utf8")).toBeLessThanOrEqual(120);
  });
});
