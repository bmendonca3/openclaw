import { describe, expect, it } from "vitest";
import { analyzeConfigSchema } from "./config-form.analyze.ts";

describe("analyzeConfigSchema", () => {
  it("supports SecretInput unions when source uses enum values", () => {
    const schema = {
      type: "object",
      properties: {
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              appSecret: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    required: ["source", "provider", "id"],
                    additionalProperties: false,
                    properties: {
                      source: { type: "string", enum: ["env", "file", "exec"] },
                      provider: { type: "string" },
                      id: { type: "string" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };

    const analysis = analyzeConfigSchema(schema);
    expect(analysis.unsupportedPaths).not.toContain("accounts");
    expect(analysis.unsupportedPaths).not.toContain("accounts.*.appSecret");
  });
});
