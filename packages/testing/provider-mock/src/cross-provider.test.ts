import { describe, expect, it } from "vitest";
import { buildCrossProviderConformanceMatrix } from "./cross-provider.js";

describe("cross-provider conformance matrix", () => {
  it("selects every unique active deployment only when a model spans providers", () => {
    const matrix = buildCrossProviderConformanceMatrix([{
      providerId: "alpha",
      models: [{ api_model_id: "owner/shared", internal_model_id: "owner/shared", provider_model_slug: "shared-a", is_active_gateway: true, capabilities: [{ capability_id: "text.generate", params: ["tools"] }] }],
    }, {
      providerId: "beta",
      models: [
        { api_model_id: "owner/shared", internal_model_id: "owner/shared", provider_model_slug: "shared-b", is_active_gateway: true, capabilities: [{ capability_id: "text.generate", status: "active", params: [{ param_id: "temperature" }] }] },
        { api_model_id: "owner/solo", internal_model_id: "owner/solo", provider_model_slug: "solo", is_active_gateway: true, capabilities: [{ capability_id: "text.generate" }] },
      ],
    }]);

    expect(matrix.modelCount).toBe(1);
    expect(matrix.providerCount).toBe(2);
    expect(matrix.deployments).toHaveLength(2);
    expect(matrix.groups[0]).toMatchObject({ internalModelId: "owner/shared", providers: ["alpha", "beta"] });
    expect(matrix.deployments.map((deployment) => deployment.parameters)).toEqual([["tools"], ["temperature"]]);
  });

  it("excludes inactive, expired, and capability-mismatched deployments", () => {
    const models = [
      { api_model_id: "owner/shared", internal_model_id: "owner/shared", provider_model_slug: "inactive", is_active_gateway: false, capabilities: [{ capability_id: "text.generate" }] },
      { api_model_id: "owner/shared", internal_model_id: "owner/shared", provider_model_slug: "expired", is_active_gateway: true, effective_to: "2025-01-01", capabilities: [{ capability_id: "text.generate" }] },
      { api_model_id: "owner/shared", internal_model_id: "owner/shared", provider_model_slug: "image", is_active_gateway: true, capabilities: [{ capability_id: "image.generate" }] },
    ];
    const matrix = buildCrossProviderConformanceMatrix([{ providerId: "alpha", models } as any], { now: "2026-07-12" });
    expect(matrix.deployments).toEqual([]);
  });

  it("can include models deployed by only one provider", () => {
    const matrix = buildCrossProviderConformanceMatrix([{
      providerId: "alpha",
      models: [{ api_model_id: "owner/solo", internal_model_id: "owner/solo", provider_model_slug: "solo", is_active_gateway: true, capabilities: [{ capability_id: "text.generate" }] }],
    }], { minProviders: 1 });
    expect(matrix.modelCount).toBe(1);
    expect(matrix.deployments).toHaveLength(1);
  });
});
