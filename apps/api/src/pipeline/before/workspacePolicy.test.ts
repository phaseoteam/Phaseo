import { describe, expect, it } from "vitest";
import {
	applyWorkspacePolicy,
	buildWorkspacePolicy,
} from "./workspacePolicy";

function provider(providerId: string): any {
	return {
		providerId,
		baseWeight: 1,
		byokMeta: [],
		pricingCard: null,
		providerModelSlug: null,
		adapter: { name: providerId },
	};
}

describe("buildWorkspacePolicy", () => {
	it("intersects allowlists, unions blocklists, and intersects allowed models", () => {
		const policy = buildWorkspacePolicy({
			globalSettings: {
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["openai", "anthropic", "google-ai-studio"],
				provider_restriction_enforce_allowed: false,
			},
			guardrails: [
				{
					id: "guardrail-1",
					provider_restriction_mode: "allowlist",
					provider_restriction_provider_ids: ["openai", "anthropic"],
					provider_restriction_enforce_allowed: true,
					allowed_api_model_ids: ["gpt-4.1", "claude-4-sonnet"],
				},
				{
					id: "guardrail-2",
					provider_restriction_mode: "blocklist",
					provider_restriction_provider_ids: ["anthropic"],
					provider_restriction_enforce_allowed: false,
					allowed_api_model_ids: ["gpt-4.1", "gpt-5.4-mini"],
				},
			],
		});

		expect(policy.providerAllowlist).toEqual(["openai", "anthropic"]);
		expect(policy.providerBlocklist).toEqual(["anthropic"]);
		expect(policy.allowedApiModels).toEqual(["gpt-4.1"]);
		expect(policy.enforceAllowed).toBe(true);
		expect(policy.activeGuardrailIds).toEqual(["guardrail-1", "guardrail-2"]);
	});
});

describe("applyWorkspacePolicy", () => {
	it("filters providers using workspace policy and request hints", () => {
		const result = applyWorkspacePolicy({
			providers: [provider("openai"), provider("anthropic"), provider("google-ai-studio")],
			resolvedModel: "gpt-4.1",
			body: {
				provider: {
					only: ["openai", "anthropic"],
					ignore: ["anthropic"],
				},
			},
			workspacePolicy: {
				providerAllowlist: ["openai", "anthropic"],
				providerBlocklist: ["google-ai-studio"],
				allowedApiModels: ["gpt-4.1"],
				enforceAllowed: true,
				activeGuardrailIds: ["guardrail-1"],
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.providers.map((item) => item.providerId)).toEqual(["openai"]);
		expect(result.diagnostics.beforeCount).toBe(3);
		expect(result.diagnostics.afterCount).toBe(1);
	});

	it("rejects models outside the allowed api model set", () => {
		const result = applyWorkspacePolicy({
			providers: [provider("openai")],
			resolvedModel: "claude-4-sonnet",
			body: {},
			workspacePolicy: {
				providerAllowlist: null,
				providerBlocklist: null,
				allowedApiModels: ["gpt-4.1"],
				enforceAllowed: false,
				activeGuardrailIds: ["guardrail-1"],
			},
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("model_not_allowed");
		expect(result.diagnostics.allowedApiModels).toEqual(["gpt-4.1"]);
	});
});
