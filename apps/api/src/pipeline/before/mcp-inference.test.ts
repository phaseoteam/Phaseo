import { describe, expect, it } from "vitest";
import { reviewedMcpRunMatches } from "./mcp-inference";

describe("reviewed MCP inference routing", () => {
  const body = {
    model: "lab/test",
    messages: [{ role: "user", content: "hi" }],
    max_completion_tokens: 512,
    stream: false,
    store: false,
    provider: {
      only: ["provider"],
      allow_fallbacks: false,
      require_parameters: true,
    },
  };
  it("permits unchanged reviewed requests and privacy routing constraints", () => {
    expect(reviewedMcpRunMatches(body, body)).toBe(true);
    expect(
      reviewedMcpRunMatches(body, {
        ...body,
        provider: { ...body.provider, require_zero_data_retention: true },
      }),
    ).toBe(true);
  });
  it("rejects model/provider substitutions, token increases, prompt edits and fallbacks", () => {
    for (const changed of [
      { ...body, model: "lab/other" },
      { ...body, max_completion_tokens: 1024 },
      { ...body, messages: [] },
      { ...body, provider: { ...body.provider, only: ["other"] } },
      { ...body, provider: { ...body.provider, allow_fallbacks: true } },
      { ...body, routing: { model_fallbacks: ["lab/other"] } },
      { ...body, store: true },
    ])
      expect(reviewedMcpRunMatches(body, changed)).toBe(false);
    expect(reviewedMcpRunMatches(body, body, ["lab/other"])).toBe(false);
  });
});
