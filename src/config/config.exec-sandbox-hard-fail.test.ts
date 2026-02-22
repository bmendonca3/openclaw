import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("exec sandbox host hard-fail validation", () => {
  it("rejects global exec host=sandbox when default sandbox mode is off", () => {
    const res = validateConfigObject({
      tools: {
        exec: {
          host: "sandbox",
        },
      },
      agents: {
        defaults: {
          sandbox: {
            mode: "off",
          },
        },
      },
    });

    expect(res.ok).toBe(false);
  });

  it("accepts global exec host=sandbox when default sandbox mode is enabled", () => {
    const res = validateConfigObject({
      tools: {
        exec: {
          host: "sandbox",
        },
      },
      agents: {
        defaults: {
          sandbox: {
            mode: "non-main",
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects per-agent exec host=sandbox when effective agent sandbox mode is off", () => {
    const res = validateConfigObject({
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
          },
        },
        list: [
          {
            id: "worker",
            sandbox: {
              mode: "off",
            },
            tools: {
              exec: {
                host: "sandbox",
              },
            },
          },
        ],
      },
    });

    expect(res.ok).toBe(false);
  });
});
