import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import {
  ELEVATED_EXEC_TOOL,
  clearSessionElevatedToolGrant,
  resolveEffectiveElevatedExecLevel,
  resolveSessionElevatedToolGrant,
  setSessionElevatedToolGrant,
} from "./reply-elevated.js";

function makeSessionEntry(overrides?: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: "session-1",
    updatedAt: 0,
    ...overrides,
  };
}

describe("reply-elevated exec grants", () => {
  it("maps inline elevated directive immediately for current turn", () => {
    const entry = makeSessionEntry();
    expect(
      resolveEffectiveElevatedExecLevel({
        directiveLevel: "full",
        sessionEntry: entry,
        fallbackLevel: "on",
        elevatedAllowed: true,
      }),
    ).toBe("full");
    expect(
      resolveEffectiveElevatedExecLevel({
        directiveLevel: "on",
        sessionEntry: entry,
        fallbackLevel: "on",
        elevatedAllowed: true,
      }),
    ).toBe("ask");
  });

  it("requires an active session grant for persisted elevated session overrides", () => {
    const now = 1_000_000;
    const entry = makeSessionEntry({ elevatedLevel: "full" });
    setSessionElevatedToolGrant({
      sessionEntry: entry,
      toolName: ELEVATED_EXEC_TOOL,
      level: "full",
      ttlMs: 60_000,
      now,
    });

    expect(
      resolveEffectiveElevatedExecLevel({
        sessionEntry: entry,
        fallbackLevel: "on",
        elevatedAllowed: true,
        now: now + 1_000,
      }),
    ).toBe("full");

    expect(
      resolveEffectiveElevatedExecLevel({
        sessionEntry: entry,
        fallbackLevel: "on",
        elevatedAllowed: true,
        now: now + 61_000,
      }),
    ).toBe("off");
  });

  it("keeps fallback elevated default when no session override exists", () => {
    const entry = makeSessionEntry();
    expect(
      resolveEffectiveElevatedExecLevel({
        sessionEntry: entry,
        fallbackLevel: "on",
        elevatedAllowed: true,
      }),
    ).toBe("on");
    expect(
      resolveEffectiveElevatedExecLevel({
        sessionEntry: entry,
        fallbackLevel: "off",
        elevatedAllowed: true,
      }),
    ).toBe("off");
  });

  it("clears grants explicitly", () => {
    const now = 1_000_000;
    const entry = makeSessionEntry();
    setSessionElevatedToolGrant({
      sessionEntry: entry,
      toolName: ELEVATED_EXEC_TOOL,
      level: "ask",
      ttlMs: 60_000,
      now,
    });
    expect(
      resolveSessionElevatedToolGrant({ sessionEntry: entry, toolName: ELEVATED_EXEC_TOOL, now }),
    ).toBe("ask");

    clearSessionElevatedToolGrant({ sessionEntry: entry, toolName: ELEVATED_EXEC_TOOL });
    expect(
      resolveSessionElevatedToolGrant({ sessionEntry: entry, toolName: ELEVATED_EXEC_TOOL, now }),
    ).toBe("off");
  });
});
