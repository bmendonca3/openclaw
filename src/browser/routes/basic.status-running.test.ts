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

  it("reports extension profiles as not running when relay HTTP is unreachable", () => {
    expect(
      resolveBrowserStatusRunning({
        driver: "extension",
        cdpHttp: false,
        cdpReady: false,
      }),
    ).toBe(false);
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

  it("reports openclaw profiles as running when CDP websocket is ready", () => {
    expect(
      resolveBrowserStatusRunning({
        driver: "openclaw",
        cdpHttp: false,
        cdpReady: true,
      }),
    ).toBe(true);
  });
});
