import { buildRoutingExplanation } from "./routingExplanation";

describe("buildRoutingExplanation", () => {
	test("explains workspace policy and terminal filter stages", () => {
		const lines = buildRoutingExplanation({
			reason: "all_candidates_failed",
			providerFailureCategory: undefined,
			routingDiagnostics: {
				filterStages: [
					{
						stage: "capability_status_gate",
						beforeCount: 2,
						afterCount: 0,
						droppedProviders: [
							{
								providerId: "google-ai-studio",
								reason:
									"capability_status_internal_testing_requires_testing_mode",
							},
						],
					},
				],
				workspacePolicy: {
					resolvedModel: "openai/gpt-4o-mini",
					allowedApiModels: ["openai/gpt-4o-mini"],
					providerAllowlist: ["openai"],
					providerBlocklist: [],
					requestProviderOnly: [],
					requestProviderIgnore: [],
					activeGuardrailIds: ["gr_123"],
					beforeCount: 3,
					afterCount: 2,
				},
				consideredProviders: [
					{
						providerId: "openai",
						apiModelId: null,
						providerModelSlug: null,
						providerStatus: "active",
						providerRoutingStatus: "active",
						modelRoutingStatus: "active",
						capabilityStatus: "active",
						baseWeight: 1,
					},
				],
				rankedProviders: [],
			},
		});

		expect(lines).toEqual([
			"Routing considered 1 provider before execution.",
			"Workspace policy reduced the candidate pool from 3 to 2 using model allowlist, provider allowlist.",
			"The Capability Status Gate filter stage removed every remaining provider, mainly because of Capability Status Internal Testing Requires Testing Mode.",
			"The final gateway failure reason was all candidates failed.",
		]);
	});

	test("explains ranked providers and failure category", () => {
		const lines = buildRoutingExplanation({
			reason: "all_candidates_failed",
			providerFailureCategory: "rate_limited",
			routingDiagnostics: {
				filterStages: [],
				workspacePolicy: undefined,
				consideredProviders: [
					{
						providerId: "openai",
						apiModelId: null,
						providerModelSlug: null,
						providerStatus: "active",
						providerRoutingStatus: "active",
						modelRoutingStatus: "active",
						capabilityStatus: "active",
						baseWeight: 1,
					},
					{
						providerId: "anthropic",
						apiModelId: null,
						providerModelSlug: null,
						providerStatus: "active",
						providerRoutingStatus: "active",
						modelRoutingStatus: "active",
						capabilityStatus: "active",
						baseWeight: 1,
					},
				],
				rankedProviders: [
					{
						providerId: "openai",
						apiModelId: "openai/gpt-free-b",
						providerModelSlug: "gpt-free-b",
						score: 0.92,
						breaker: "closed",
						breakerUntilMs: 0,
						scoreFactors: {
							successRate: 0.99,
							latencyScore: 0.91,
							tailLatencyScore: 0.7,
							throughputScore: 0.4,
							priceScore: 0.5,
							tokenAffinity: 0.2,
							loadPenalty: 0.1,
							baseWeight: 1,
							rolloutMultiplier: 1,
							routingMultiplier: 1,
							cacheBoostMultiplier: 1.5,
						},
					},
					{
						providerId: "anthropic",
						apiModelId: "anthropic/claude-free",
						providerModelSlug: "claude-free",
						score: 0.88,
						breaker: "closed",
						breakerUntilMs: 0,
						scoreFactors: {
							successRate: 0.95,
							latencyScore: 0.7,
							tailLatencyScore: 0.6,
							throughputScore: 0.5,
							priceScore: 0.6,
							tokenAffinity: 0.3,
							loadPenalty: 0.2,
							baseWeight: 1,
							rolloutMultiplier: 1,
							routingMultiplier: 1,
							cacheBoostMultiplier: 1,
						},
					},
				],
			},
		});

		expect(lines).toEqual([
			"Routing considered 2 providers before execution.",
			"The top-ranked provider was openai using openai/gpt-free-b, driven mostly by cached context reuse, success rate, latency.",
			"Routing still had 2 executable providers after filtering, with openai ahead of anthropic using anthropic/claude-free.",
			"Execution ultimately failed because the leading provider attempts were classified as rate limited.",
		]);
	});
});
