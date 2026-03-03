import { describe, expect, it } from "vitest";
import { resolveBrowserStatusRunning } from "./basic.js";

describe("resolveBrowserStatusRunning", () => {
  it("uses relay HTTP reachability for extension profiles", () => {
    expect(
      resolveBrowserStatusRunning({
        driver: "extension",
        cdpHttp: true,
        cdpReady: false,
      }),
    ).toBe(true);
  });

  it("uses CDP websocket readiness for openclaw profiles", () => {
    expect(
      resolveBrowserStatusRunning({
        driver: "openclaw",
        cdpHttp: true,
        cdpReady: false,
      }),
    ).toBe(false);
  });
});
