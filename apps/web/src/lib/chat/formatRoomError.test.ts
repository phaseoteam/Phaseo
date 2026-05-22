import { formatRoomError } from "./formatRoomError";

describe("formatRoomError", () => {
	test("explains unsupported endpoint when the model exists but no provider supports the room", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "unsupported_model_or_endpoint",
				description: "Unsupported model or endpoint.",
				provider_candidate_diagnostics: {
					totalProviders: 3,
					supportsEndpointCount: 0,
					candidateCount: 0,
				},
			})
		);

		expect(formatted.hint).toBe(
			"This model is known in the gateway, but no provider currently supports this room endpoint. Try a model that matches the room type."
		);
	});

	test("explains missing pricing for unsupported model diagnostics", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "unsupported_model_or_endpoint",
				description: "Unsupported model or endpoint.",
				provider_candidate_diagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					candidateCount: 1,
				},
				provider_enablement: {
					capability: "moderations",
					providersBefore: ["openai"],
					providersAfter: [],
					dropped: [{ providerId: "openai", reason: "pricing_missing" }],
				},
			})
		);

		expect(formatted.hint).toBe(
			"A provider mapping exists for this endpoint, but pricing is not configured yet. Try another provider or model until pricing is enabled."
		);
	});

	test("explains internal-testing-only routing failures", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "All providers failed.",
				routing_diagnostics: {
					filterStages: [{
						stage: "capability_status_gate",
						beforeCount: 1,
						afterCount: 0,
						droppedProviders: [{
							providerId: "google-ai-studio",
							reason: "capability_status_internal_testing_requires_testing_mode",
						}],
					}],
				},
			})
		);

		expect(formatted.hint).toBe(
			"This model/provider mapping exists, but the endpoint is internal-testing only right now and is not publicly routable in this room."
		);
	});

	test("explains routing-disabled failures", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "All providers failed.",
				routing_diagnostics: {
					filterStages: [{
						stage: "model_routing_status_gate",
						beforeCount: 2,
						afterCount: 0,
						droppedProviders: [{
							providerId: "openai",
							reason: "model_routing_status_disabled",
						}],
					}],
				},
			})
		);

		expect(formatted.hint).toBe(
			"This model/provider mapping is known in the gateway, but routing is currently disabled for this endpoint."
		);
	});

	test("prefers structured provider failure diagnostics when present", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "All providers failed.",
				provider_failure_diagnostics: {
					category: "credentials_not_configured",
					hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
					provider: "google-vertex",
				},
			})
		);

		expect(formatted.hint).toBe(
			"Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying."
		);
	});

	test("preserves provider failure category and failure sample details", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "All providers failed.",
				provider_failure_diagnostics: {
					category: "region_or_project_restriction",
					hint: "The provider appears to be restricted by region, location, or project configuration. Verify the provider region and project access for this model.",
					provider: "google-vertex",
				},
				failure_sample: [
					{
						provider: "google-vertex",
						status: 403,
						upstream_error_code: "permission_denied",
						upstream_error_message: "Project is not allowed in this region.",
						upstream_error_description:
							"Model access is limited to specific project locations.",
					},
				],
			})
		);

		expect(formatted.providerFailureCategory).toBe(
			"region_or_project_restriction"
		);
		expect(formatted.providerFailureProvider).toBe("google-vertex");
		expect(formatted.failureSample).toEqual([
			{
				provider: "google-vertex",
				status: 403,
				upstreamErrorCode: "permission_denied",
				upstreamErrorMessage: "Project is not allowed in this region.",
				upstreamErrorDescription:
					"Model access is limited to specific project locations.",
			},
		]);
	});

	test("preserves structured upstream error diagnostics", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "Provider rejected the request.",
				upstream_error: {
					code: "PERMISSION_DENIED",
					message: "The caller does not have permission.",
					description: "Project is not allowed to access this model.",
					param: "model",
				},
			})
		);

		expect(formatted.upstreamError).toEqual({
			code: "PERMISSION_DENIED",
			message: "The caller does not have permission.",
			description: "Project is not allowed to access this model.",
			param: "model",
		});
	});

	test("preserves candidate, enablement, and routing diagnostics details", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "unsupported_model_or_endpoint",
				description: "Unsupported model or endpoint.",
				provider_candidate_diagnostics: {
					totalProviders: 3,
					supportsEndpointCount: 2,
					candidateCount: 1,
					droppedUnsupportedEndpoint: ["moderations"],
					droppedMissingAdapter: [
						{
							providerId: "anthropic",
							endpoint: "responses",
						},
					],
				},
				provider_enablement: {
					capability: "responses",
					providersBefore: ["openai", "anthropic"],
					providersAfter: ["openai"],
					dropped: [
						{
							providerId: "anthropic",
							reason: "pricing_missing",
						},
					],
				},
				routing_diagnostics: {
					filterStages: [
						{
							stage: "provider_status_gate",
							beforeCount: 2,
							afterCount: 1,
							droppedProviders: [
								{
									providerId: "anthropic",
									reason: "beta_requires_team_beta_channel",
								},
							],
						},
					],
				},
			})
		);

		expect(formatted.providerCandidateDiagnostics).toEqual({
			totalProviders: 3,
			supportsEndpointCount: 2,
			candidateCount: 1,
			droppedUnsupportedEndpoint: ["moderations"],
			droppedMissingAdapter: [
				{
					providerId: "anthropic",
					endpoint: "responses",
				},
			],
		});
		expect(formatted.providerEnablement).toEqual({
			capability: "responses",
			providersBefore: ["openai", "anthropic"],
			providersAfter: ["openai"],
			dropped: [
				{
					providerId: "anthropic",
					reason: "pricing_missing",
				},
			],
		});
		expect(formatted.routingDiagnostics).toEqual({
			filterStages: [
				{
					stage: "provider_status_gate",
					beforeCount: 2,
					afterCount: 1,
					droppedProviders: [
						{
							providerId: "anthropic",
							reason: "beta_requires_team_beta_channel",
						},
					],
				},
			],
			workspacePolicy: undefined,
			consideredProviders: [],
			rankedProviders: [],
		});
	});

	test("preserves workspace policy diagnostics for guardrail-driven validation failures", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "validation_error",
				description: "Workspace policy blocked this request.",
				routing_diagnostics: {
					workspacePolicy: {
						resolvedModel: "blocked-model",
						allowedApiModels: ["allowed-model"],
						providerAllowlist: ["anthropic"],
						providerBlocklist: ["xai"],
						requestProviderOnly: [],
						requestProviderIgnore: ["openai"],
						activeGuardrailIds: ["gr_123"],
						beforeCount: 3,
						afterCount: 0,
					},
				},
			}),
		);

		expect(formatted.routingDiagnostics).toEqual({
			filterStages: [],
			workspacePolicy: {
				resolvedModel: "blocked-model",
				allowedApiModels: ["allowed-model"],
				providerAllowlist: ["anthropic"],
				providerBlocklist: ["xai"],
				requestProviderOnly: [],
				requestProviderIgnore: ["openai"],
				activeGuardrailIds: ["gr_123"],
				beforeCount: 3,
				afterCount: 0,
			},
			consideredProviders: [],
			rankedProviders: [],
		});
	});

	test("extracts workspace policy diagnostics from validation details when top-level routing diagnostics are absent", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "validation_error",
				description: "Workspace policy blocked this request.",
				details: [
					{
						keyword: "model_not_allowed_by_workspace_policy",
						params: {
							resolvedModel: "blocked-model",
							allowedApiModels: ["allowed-model"],
							providerAllowlist: ["anthropic"],
							providerBlocklist: ["xai"],
							requestProviderOnly: ["openai"],
							requestProviderIgnore: [],
							activeGuardrailIds: ["gr_123"],
							beforeCount: 4,
							afterCount: 0,
						},
					},
				],
			}),
		);

		expect(formatted.routingDiagnostics).toEqual({
			filterStages: [],
			workspacePolicy: {
				resolvedModel: "blocked-model",
				allowedApiModels: ["allowed-model"],
				providerAllowlist: ["anthropic"],
				providerBlocklist: ["xai"],
				requestProviderOnly: ["openai"],
				requestProviderIgnore: [],
				activeGuardrailIds: ["gr_123"],
				beforeCount: 4,
				afterCount: 0,
			},
			consideredProviders: [],
			rankedProviders: [],
		});
	});

	test("preserves considered and ranked provider routing diagnostics", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				description: "All providers failed.",
				routing_diagnostics: {
					filterStages: [],
					consideredProviders: [
						{
							providerId: "openai",
							apiModelId: "openai/gpt-free-b",
							providerModelSlug: "gpt-free-b",
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
							score: 0.912345,
							breaker: "closed",
							breakerUntilMs: 0,
							scoreFactors: {
								successRate: 0.99,
								latencyScore: 0.8,
								tailLatencyScore: 0.7,
								throughputScore: 0.6,
								priceScore: 0.5,
								tokenAffinity: 0.4,
								loadPenalty: 0.1,
								baseWeight: 1,
								rolloutMultiplier: 1,
								routingMultiplier: 1,
								cacheBoostMultiplier: 1,
							},
						},
					],
				},
			}),
		);

		expect(formatted.routingDiagnostics).toEqual({
			filterStages: [],
			workspacePolicy: undefined,
			consideredProviders: [
				{
					providerId: "openai",
					apiModelId: "openai/gpt-free-b",
					providerModelSlug: "gpt-free-b",
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
					score: 0.912345,
					breaker: "closed",
					breakerUntilMs: 0,
					scoreFactors: {
						successRate: 0.99,
						latencyScore: 0.8,
						tailLatencyScore: 0.7,
						throughputScore: 0.6,
						priceScore: 0.5,
						tokenAffinity: 0.4,
						loadPenalty: 0.1,
						baseWeight: 1,
						rolloutMultiplier: 1,
						routingMultiplier: 1,
						cacheBoostMultiplier: 1,
					},
				},
			],
		});
	});

	test("preserves routed failure aggregates from gateway error payloads", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "upstream_error",
				reason: "all_candidates_failed",
				description: "All providers failed.",
				attempt_count: 3,
				failed_providers: ["openai", "anthropic"],
				failed_statuses: [429, "503"],
			})
		);

		expect(formatted.reason).toBe("all_candidates_failed");
		expect(formatted.attemptCount).toBe(3);
		expect(formatted.failedProviders).toEqual(["openai", "anthropic"]);
		expect(formatted.failedStatuses).toEqual([429, 503]);
	});

	test("preserves key limit diagnostics and creates a concrete hint", () => {
		const formatted = formatRoomError(
			JSON.stringify({
				error: "key_limit_exceeded",
				description: "This API key has reached its daily request limit (100/100).",
				reason: "daily_request_limit_reached",
				limit_window: "daily",
				limit_metric: "requests",
				current_value: 100,
				limit_value: 100,
				reset_at: "2026-05-09T23:59:59.000Z",
				now: "2026-05-09T12:00:00.000Z",
				buckets: {
					daily: {
						window_start: "2026-05-09T00:00:00.000Z",
						requests_used: 100,
						requests_limit: 100,
						cost_used_nanos: 0,
						cost_limit_nanos: 0,
					},
				},
			}),
		);

		expect(formatted.title).toBe("Key limit exceeded");
		expect(formatted.hint).toBe(
			"This API key hit its daily request limit (100/100). Wait for the reset window or raise the key limit.",
		);
		expect(formatted.keyLimit).toEqual({
			window: "daily",
			metric: "requests",
			currentValue: 100,
			limitValue: 100,
			resetAt: "2026-05-09T23:59:59.000Z",
			now: "2026-05-09T12:00:00.000Z",
			buckets: {
				daily: {
					windowStart: "2026-05-09T00:00:00.000Z",
					requestsUsed: 100,
					requestsLimit: 100,
					costUsedNanos: 0,
					costLimitNanos: 0,
				},
				weekly: undefined,
				monthly: undefined,
			},
		});
	});
});
