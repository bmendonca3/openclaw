import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const note = vi.hoisted(() => vi.fn());

vi.mock("../terminal/note.js", () => ({
  note,
}));

import {
  collectBreakingChangeUpgradeWarnings,
  DOCTOR_BREAKING_CHANGE_CHECKS,
  noteBreakingChangeUpgradeWarnings,
} from "./doctor-breaking-checks.js";

describe("doctor breaking-change upgrade checks", () => {
  it("registers breaking-change checks with metadata", () => {
    expect(DOCTOR_BREAKING_CHANGE_CHECKS.length).toBeGreaterThan(0);
    expect(DOCTOR_BREAKING_CHANGE_CHECKS[0]).toMatchObject({
      id: expect.any(String),
      introducedIn: expect.any(String),
    });
  });

  it("warns for telegram allowlist mode without sender allowlist", () => {
    const cfg = {
      channels: {
        telegram: {
          enabled: true,
          botToken: "token",
          groupPolicy: "allowlist",
        },
      },
    } as OpenClawConfig;

    const warnings = collectBreakingChangeUpgradeWarnings(cfg);
    const warningText = warnings.join("\n");
    expect(warningText).toContain("[2026.2.25]");
    expect(warningText).toContain('groupPolicy resolves to "allowlist"');
    expect(warningText).toContain("channels.telegram.groupAllowFrom");
  });

  it("uses account-scoped config path for named telegram accounts", () => {
    const cfg = {
      channels: {
        telegram: {
          enabled: true,
          accounts: {
            alerts: {
              botToken: "token",
              groupPolicy: "allowlist",
            },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = collectBreakingChangeUpgradeWarnings(cfg);
    expect(warnings.join("\n")).toContain("channels.telegram.accounts.alerts.groupAllowFrom");
  });

  it("does not warn when telegram sender allowlist is configured", () => {
    const cfg = {
      channels: {
        telegram: {
          enabled: true,
          botToken: "token",
          groupPolicy: "allowlist",
          groupAllowFrom: ["123456"],
        },
      },
    } as OpenClawConfig;

    expect(collectBreakingChangeUpgradeWarnings(cfg)).toEqual([]);
  });

  it("does not warn when open overrides are configured", () => {
    const cfg = {
      channels: {
        telegram: {
          enabled: true,
          botToken: "token",
          groupPolicy: "allowlist",
          groups: {
            "-100123": {
              groupPolicy: "open",
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(collectBreakingChangeUpgradeWarnings(cfg)).toEqual([]);
  });

  it("emits upgrade notes only when warnings exist", () => {
    note.mockClear();
    const cfg = {
      channels: {
        telegram: {
          enabled: true,
          botToken: "token",
          groupPolicy: "allowlist",
        },
      },
    } as OpenClawConfig;

    noteBreakingChangeUpgradeWarnings(cfg);

    expect(note).toHaveBeenCalledTimes(1);
    expect(String(note.mock.calls[0]?.[1])).toBe("Upgrade");
    expect(String(note.mock.calls[0]?.[0])).toContain("openclaw doctor");

    note.mockClear();
    noteBreakingChangeUpgradeWarnings({} as OpenClawConfig);
    expect(note).not.toHaveBeenCalled();
  });
});
