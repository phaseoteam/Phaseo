import { describe, expect, it } from "vitest";
import { assertConformanceExpectations, buildModelConformanceMatrix } from "./conformance.js";

describe("model conformance matrix", () => {
  it("generates baseline and isolated parameter cases", () => {
    const matrix = buildModelConformanceMatrix([{
      api_model_id: "acme/model",
      provider_model_slug: "model",
      is_active_gateway: true,
      capabilities: [{ capability_id: "text.generate", status: "active", params: [{ param_id: "temperature" }, "tools"] }],
    }], {
      temperature: { outcome: "forwarded", requestValue: 0.4, upstreamPaths: ["temperature"] },
      tools: { outcome: "transformed", requestValue: [], upstreamPaths: ["tools"] },
    });
    expect(matrix.cases.map((entry) => entry.kind)).toEqual(["baseline", "parameter", "parameter"]);
    expect(matrix.uncoveredParameters).toEqual([]);
    expect(() => assertConformanceExpectations(matrix)).not.toThrow();
  });

  it("fails coverage when catalog parameters have no expected outcome", () => {
    const matrix = buildModelConformanceMatrix([{
      api_model_id: "acme/model",
      provider_model_slug: "model",
      is_active_gateway: true,
      capabilities: [{ capability_id: "video.generate", params: { seconds: { values: [4, 8] } } }],
    }], {});
    expect(matrix.uncoveredParameters).toEqual(["seconds"]);
    expect(() => assertConformanceExpectations(matrix)).toThrow("seconds");
  });
});
