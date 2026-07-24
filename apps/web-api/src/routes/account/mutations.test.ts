import { describe, expect, it } from "vitest";
import app from "@/index";

describe("account mutation boundaries", () => {
	it.each([
		["PUT", "/api/account/settings/beta", { beta_features: {} }],
		["PUT", "/api/account/settings/routing", { workspaceId: "workspace-1", mode: "balanced" }],
		["DELETE", "/api/account/settings/authorized-apps/authorization-1", undefined],
		["PUT", "/api/account/settings/apps/app-1", { title: "Updated" }],
		["POST", "/api/account/credits/admin/grants", { code: "TEST", amount_nanos: 1_000_000_000, max_redemptions: 1 }],
		["PUT", "/api/account/credits/auto-top-up", { workspaceId: "workspace-1", enabled: false }],
		["PUT", "/api/account/credits/low-balance-alert", { workspaceId: "workspace-1", enabled: false }],
		["POST", "/api/account/credits/redeem", { workspaceId: "workspace-1", code: "TEST" }],
		["PUT", "/api/account/auth/onboarding", { status: "started" }],
		["POST", "/api/account/settings/keys", { name: "Test", workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/keys/key-1", { paused: true }],
		["POST", "/api/account/settings/keys/key-1/rotate", {}],
		["DELETE", "/api/account/settings/keys/key-1", undefined],
		["POST", "/api/account/settings/management-keys", { name: "Test", workspaceId: "workspace-1", template: "read-only" }],
		["PUT", "/api/account/settings/management-keys/key-1", { paused: true }],
		["DELETE", "/api/account/settings/management-keys/key-1", undefined],
		["POST", "/api/account/settings/oauth-apps", { name: "Test app", workspace_id: "workspace-1", redirect_uris: ["https://example.com/callback"], allowed_scopes: ["openid"] }],
		["PUT", "/api/account/settings/oauth-apps/client-1", { name: "Updated app" }],
		["POST", "/api/account/settings/oauth-apps/client-1/regenerate-secret", undefined],
		["DELETE", "/api/account/settings/oauth-apps/client-1", undefined],
		["POST", "/api/account/settings/byok", { name: "OpenAI", providerId: "openai", value: "sk-example-example-example", workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/byok/key-1", { enabled: false }],
		["DELETE", "/api/account/settings/byok/key-1", undefined],
		["PUT", "/api/account/settings/byok-fallback", { enabled: true, workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/guardrails/global", { workspaceId: "workspace-1", privacyZdrOnly: true }],
		["POST", "/api/account/settings/guardrails", { workspaceId: "workspace-1", name: "Default" }],
		["PUT", "/api/account/settings/guardrails/guardrail-1", { workspaceId: "workspace-1", name: "Updated" }],
		["DELETE", "/api/account/settings/guardrails/guardrail-1", { workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/guardrails/guardrail-1/keys", { workspaceId: "workspace-1", keyIds: [] }],
		["PUT", "/api/account/settings/account/profile", { display_name: "Test" }],
		["DELETE", "/api/account/settings/account", undefined],
		["POST", "/api/account/settings/account/recovery-codes", undefined],
		["DELETE", "/api/account/settings/account/recovery-codes", undefined],
		["POST", "/api/account/settings/account/recovery-codes/verify", { code: "TEST-CODE" }],
		["POST", "/api/account/settings/broadcast", { destinationId: "webhook", name: "Test", config: { url: "https://example.com" }, workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/broadcast/destination-1/disable", undefined],
		["DELETE", "/api/account/settings/broadcast/destination-1", undefined],
		["POST", "/api/account/settings/broadcast/destination-1/status", undefined],
		["POST", "/api/account/settings/broadcast/destination-1/sample", undefined],
		["POST", "/api/account/settings/broadcast/test-config", { destinationId: "webhook", config: { url: "https://example.com" }, workspaceId: "workspace-1" }],
		["POST", "/api/account/settings/webhooks", { name: "Test", url: "https://example.com", workspaceId: "workspace-1" }],
		["PUT", "/api/account/settings/webhooks/endpoint-1/status", { status: "disabled", workspaceId: "workspace-1" }],
		["POST", "/api/account/settings/webhooks/endpoint-1/rotate", { workspaceId: "workspace-1" }],
		["DELETE", "/api/account/settings/webhooks/endpoint-1", { workspaceId: "workspace-1" }],
		["POST", "/api/account/auth/oauth-consent/validate", { clientId: "phaseo_cli", workspaceIds: ["workspace-1"] }],
		["POST", "/api/account/models/catalog/benchmarks", { id: "benchmark-test", name: "Benchmark Test" }],
		["POST", "/api/account/models/catalog/subscription-plans", { plan_uuid: "plan-uuid", plan_id: "plan", name: "Plan", frequency: "monthly", price: 10, currency: "USD" }],
		["POST", "/api/account/models", { modelId: "org/model", name: "Model" }],
		["PATCH", "/api/account/models/org%2Fmodel", { name: "Updated model" }],
		["POST", "/api/account/models/catalog/organisations", { organisation_id: "org", name: "Org" }],
		["PUT", "/api/account/models/catalog/organisations/org", { name: "Org" }],
		["DELETE", "/api/account/models/catalog/organisations/org", undefined],
		["POST", "/api/account/models/catalog/providers", { api_provider_id: "provider", api_provider_name: "Provider" }],
		["PUT", "/api/account/models/catalog/providers/provider", { api_provider_name: "Provider" }],
		["DELETE", "/api/account/models/catalog/providers/provider", undefined],
		["PUT", "/api/account/models/catalog/benchmarks/benchmark-test", { name: "Benchmark Test" }],
		["DELETE", "/api/account/models/catalog/benchmarks/benchmark-test", undefined],
		["PUT", "/api/account/models/org%2Fmodel/graph", { modelId: "org/model", name: "Updated" }],
		["DELETE", "/api/account/models/org%2Fmodel/benchmark-results/result-1", undefined],
		["DELETE", "/api/account/models/org%2Fmodel/pricing-rules/rule-1", undefined],
		["DELETE", "/api/account/models/org%2Fmodel/provider-models/provider-model-1", undefined],
		["POST", "/api/account/models/catalog/provider-models", { providerId: "provider", apiModelId: "org/model" }],
		["PATCH", "/api/account/models/catalog/provider-models/provider-model-1", { isActiveGateway: false }],
		["DELETE", "/api/account/models/catalog/provider-models/provider-model-1", undefined],
		["POST", "/api/account/models/catalog/benchmark-results", { modelId: "org/model", benchmarkId: "benchmark", score: "1" }],
		["PATCH", "/api/account/models/catalog/benchmark-results/result-1", { score: "2" }],
		["DELETE", "/api/account/models/catalog/benchmark-results/result-1", undefined],
		["DELETE", "/api/account/models/catalog/models/org%2Fmodel", undefined],
		["POST", "/api/account/settings/usage/actions", { workspaceId: "workspace-1", operation: "funStats", args: [{ from: "2026-01-01", to: "2026-01-02" }] }],
		["POST", "/api/account/auth/test-key", { apiKey: "aistats_sk_1234567890123456" }],
	] as const)("keeps unauthenticated %s %s private", async (method, path, body) => {
		const response = await app.request(`https://phaseo.app${path}`, {
			method,
			headers: body ? { "content-type": "application/json" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		}, { ENV: "development" });
		expect([401, 403]).toContain(response.status);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
	});

	it("does not expose a browser route that can mint a managed gateway key", async () => {
		const response = await app.request("https://phaseo.app/api/account/auth/chat-gateway", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace-1" }),
		}, { ENV: "development" });

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "not_found" });
	});
});
