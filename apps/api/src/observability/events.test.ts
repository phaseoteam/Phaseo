import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { emitGatewayRequestEvent } from "./events";
import type { PipelineContext } from "@pipeline/before/types";
import type { RequestResult } from "@pipeline/execute";

const sendAxiomWideEventMock = vi.fn(async (_event: Record<string, unknown>) => {});

vi.mock("./axiom", () => ({
	sendAxiomWideEvent: (...args: unknown[]) => sendAxiomWideEventMock(...args),
}));

describe("emitGatewayRequestEvent", () => {
	beforeEach(() => {
		sendAxiomWideEventMock.mockReset();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			AXIOM_SUCCESS_SAMPLE_RATE: "1",
			AXIOM_DETAIL_SAMPLE_RATE: "1",
			AXIOM_SLOW_REQUEST_MS: "1",
		} as any);
	});

	afterEach(() => {
		clearRuntime();
	});

	it("emits provider attempt chains for successful video generation requests", async () => {
		const ctx = {
			endpoint: "video.generation",
			capability: "video.generation",
			requestId: "req_video_obs_123",
			protocol: "openai",
			meta: {
				apiKeyId: "key_video_obs_123",
				requestMethod: "POST",
				requestPath: "/v1/videos",
				requestUrl: "https://api.phaseo.app/v1/videos",
				sessionId: "sess_video_obs_123",
				appId: "app_video_obs_123",
				before_ms: 5,
				latency_ms: 120,
				generation_ms: 95,
				throughput_tps: 0,
				adapterRequestBuildMs: 0.75,
				timeToUpstreamRequestMs: 8.5,
				timeToLatestUpstreamRequestMs: 12.25,
				upstreamHeadersMs: 84.5,
				upstreamRequestCount: 2,
				upstreamPollCount: 1,
				upstreamAuthCount: 1,
				upstreamPreflightCount: 0,
				upstreamMediaCount: 1,
			},
			rawBody: {
				model: "google/veo-3.1-lite-generate-preview",
				prompt: "A calm lake at sunrise",
				duration: 5,
			},
			body: {
				model: "google/veo-3.1-lite-generate-preview",
				prompt: "A calm lake at sunrise",
				duration: 5,
			},
			model: "google/veo-3.1-lite-generate-preview",
			workspaceId: "ws_video_obs_123",
			stream: false,
			providers: [
				{
					providerId: "google-vertex",
					pricingCard: { id: "price_google_vertex" },
					providerStatus: "active",
					capabilityStatus: "active",
				},
			],
			pricing: {},
			gating: {
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
			},
			providerAttempts: [
				{
					attempt_number: 1,
					provider: "google-vertex",
					endpoint: "video.generation",
					model: "google/veo-3.1-lite-generate-preview",
					provider_model_slug: "veo-3.1-lite-generate-preview",
					outcome: "success",
					duration_ms: 95,
					status: 200,
					status_text: "OK",
					key_source: "gateway",
					response_kind: "completed",
				},
			],
			attemptErrors: [],
			teamSettings: {
				routingMode: "balanced",
			},
			timing: {
				before_start: 5,
				ir_decode: 0.035,
				internal_latency_ms: 120,
				execute_rank_providers: 0.42,
				execute: {
					total_ms: 95,
					adapter_ms: 95,
				},
			},
		} as unknown as PipelineContext;

		const result = {
			provider: "google-vertex",
			upstream: new Response(JSON.stringify({ id: "upstream_video_job" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
			mappedRequest: JSON.stringify({ prompt: "A calm lake at sunrise" }),
			rawResponse: {
				id: "upstream_video_job",
				status: "queued",
			},
			generationTimeMs: 95,
		} as unknown as RequestResult;

		await emitGatewayRequestEvent({
			ctx,
			result,
			statusCode: 202,
			success: true,
			finishReason: null,
			usage: {
				requests: 1,
				output_video_seconds: 5,
			},
			pricing: {
				total_cents: 15,
				total_nanos: 150_000_000,
				currency: "USD",
			},
			gatewayResponse: {
				id: "req_video_obs_123",
				status: "queued",
				model: "google/veo-3.1-lite-generate-preview",
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			event_type: "gateway.request",
			request_id: "req_video_obs_123",
			generation_id: "req_video_obs_123",
			workspace_id: "ws_video_obs_123",
			endpoint: "video.generation",
			model: "google/veo-3.1-lite-generate-preview",
			provider: "google-vertex",
			success: true,
			status_code: 202,
			attempt_count: 1,
			attempted_providers_count: 1,
			cost_total_nanos: 150000000,
			cost_currency: "USD",
			provider_status_code: 200,
			route_providers_ms: 0.42,
			ir_decode_ms: 0.035,
			adapter_request_build_ms: 0.75,
			time_to_upstream_request_ms: 8.5,
			time_to_latest_upstream_request_ms: 12.25,
			upstream_headers_ms: 84.5,
			upstream_request_count: 2,
			upstream_poll_count: 1,
			upstream_auth_count: 1,
			upstream_preflight_count: 0,
			upstream_media_count: 1,
		});

		const attemptedProviders = JSON.parse(String(event.attempted_providers_json ?? "[]"));
		expect(attemptedProviders).toEqual(["google-vertex"]);

		const providerAttempts = JSON.parse(String(event.provider_attempts_json ?? "[]"));
		expect(providerAttempts).toEqual([
			expect.objectContaining({
				attempt_number: 1,
				provider: "google-vertex",
				endpoint: "video.generation",
				outcome: "success",
				duration_ms: 95,
				status: 200,
				response_kind: "completed",
			}),
		]);
	});

	it("emits routed failure diagnostics for execute-stage errors", async () => {
		const ctx = {
			endpoint: "responses",
			capability: "responses",
			requestId: "req_error_obs_123",
			protocol: "openai",
			meta: {
				apiKeyId: "key_error_obs_123",
				requestMethod: "POST",
				requestPath: "/v1/responses",
				requestUrl: "https://api.phaseo.app/v1/responses",
				sessionId: "sess_error_obs_123",
				appId: "app_error_obs_123",
				before_ms: 9,
				latency_ms: 140,
				generation_ms: 88,
			},
			rawBody: {
				model: "google/gemini-2.5-pro",
				input: "hello",
			},
			body: {
				model: "google/gemini-2.5-pro",
				input: "hello",
			},
			model: "google/gemini-2.5-pro",
			workspaceId: "ws_error_obs_123",
			stream: false,
			providers: [
				{
					providerId: "google-ai-studio",
					pricingCard: { id: "price_google_ai_studio" },
					providerStatus: "active",
					capabilityStatus: "active",
				},
				{
					providerId: "openai",
					pricingCard: { id: "price_openai" },
					providerStatus: "beta",
					capabilityStatus: "active",
				},
			],
			pricing: {},
			gating: {
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
			},
			providerEnablementDiagnostics: {
				capability: "responses",
				providersBefore: ["google-ai-studio", "openai"],
				providersAfter: ["google-ai-studio"],
				dropped: [{ providerId: "openai", reason: "pricing_missing" }],
			},
			providerCandidateBuildDiagnostics: {
				totalProviders: 2,
				supportsEndpointCount: 2,
				candidateCount: 2,
				droppedUnsupportedEndpoint: [],
				droppedMissingAdapter: [],
			},
		} as unknown as PipelineContext;

		await emitGatewayRequestEvent({
			ctx,
			mappedRequest: JSON.stringify({
				model: "gemini-2.5-pro",
				input: "hello upstream",
				temperature: 0.2,
			}),
			providerResponse: {
				error: {
					code: "PERMISSION_DENIED",
					message: "The caller does not have permission.",
					param: "model",
				},
			},
			providerResponseHeaders: {
				"x-request-id": "upstream-request-123",
				"authorization": "Bearer should-not-leak",
			},
			statusCode: 502,
			success: false,
			errorCode: "upstream_error",
			errorMessage: "All providers failed.",
			errorType: "system",
			errorStage: "execute",
			errorDetails: {
				error: "upstream_error",
				reason: "all_candidates_failed",
				status_code: 502,
				provider_failure_diagnostics: {
					category: "provider_access_missing",
					hint: "The provider account appears not to have access to this model or feature yet.",
					provider: "google-ai-studio",
				},
				upstream_error: {
					code: "PERMISSION_DENIED",
					message: "The caller does not have permission.",
					param: "model",
				},
				routing_diagnostics: {
					filterStages: [
						{
							stage: "status_gate",
							beforeCount: 2,
							afterCount: 1,
							droppedProviders: [
								{
									providerId: "openai",
									reason: "provider_status_not_ready",
								},
							],
						},
					],
					finalCandidateCount: 1,
				},
				failure_sample: [
					{
						provider: "google-ai-studio",
						type: "upstream_non_2xx",
						status: 403,
						upstream_error_code: "PERMISSION_DENIED",
						upstream_error_message: "The caller does not have permission.",
						upstream_error_description: "Project is not allowed to access this model.",
						retryable: false,
					},
					{
						provider: "openai",
						type: "blocked",
						status: 503,
						upstream_error_message: "Provider not ready.",
						retryable: true,
					},
				],
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			event_type: "gateway.request",
			request_id: "req_error_obs_123",
			generation_id: "req_error_obs_123",
			workspace_id: "ws_error_obs_123",
			endpoint: "responses",
			model: "google/gemini-2.5-pro",
			success: false,
			status_code: 502,
			error_code: "upstream_error",
			error_stage: "execute",
			error_type: "system",
			attempt_count: 2,
			attempted_providers_count: 2,
			attempt_failure_count: 2,
			routing_filter_stage_count: 1,
			routing_drop_reason_count: 1,
			routing_status_gate_before_count: 2,
			routing_status_gate_after_count: 1,
			error_is_provider_status_not_ready: true,
			upstream_error_code: "PERMISSION_DENIED",
			upstream_error_message: "The caller does not have permission.",
			upstream_error_param: "model",
			upstream_error_status: 502,
			provider_failure_category: "provider_access_missing",
			provider_failure_provider: "google-ai-studio",
			failure_sample_first_provider: "google-ai-studio",
			failure_sample_first_type: "upstream_non_2xx",
			failure_sample_first_status: 403,
			failure_sample_first_retryable: false,
			failure_sample_first_upstream_error_code: "PERMISSION_DENIED",
			failure_sample_first_upstream_error_message: "The caller does not have permission.",
		});

		const attemptedProviders = JSON.parse(String(event.attempted_providers_json ?? "[]"));
		expect(attemptedProviders).toEqual(["google-ai-studio", "openai"]);

		const providerAttempts = JSON.parse(String(event.provider_attempts_json ?? "[]"));
		expect(providerAttempts).toEqual([
			expect.objectContaining({
				provider: "google-ai-studio",
				type: "upstream_non_2xx",
				status: 403,
				upstream_error_code: "PERMISSION_DENIED",
			}),
			expect.objectContaining({
				provider: "openai",
				type: "blocked",
				status: 503,
			}),
		]);

		const routingDropReasons = JSON.parse(String(event.routing_drop_reasons_json ?? "[]"));
		expect(routingDropReasons).toEqual(["provider_status_not_ready"]);

		const providerEnablement = JSON.parse(
			String(event.provider_enablement_diagnostics_json ?? "null")
		);
		expect(providerEnablement).toEqual({
			capability: "responses",
			providersBefore: ["google-ai-studio", "openai"],
			providersAfter: ["google-ai-studio"],
			dropped: [{ providerId: "openai", reason: "pricing_missing" }],
		});

		const requestPayload = JSON.parse(String(event.request_payload_redacted_json ?? "{}"));
		expect(String(requestPayload.input)).toContain("[redacted");
		expect(requestPayload.model).toBe("google/gemini-2.5-pro");

		const upstreamRequest = JSON.parse(String(event.upstream_request_redacted_json ?? "{}"));
		expect(String(upstreamRequest.input)).toContain("[redacted");
		expect(upstreamRequest.temperature).toBe(0.2);

		const providerResponse = JSON.parse(String(event.provider_response_redacted_json ?? "{}"));
		expect(providerResponse.error.code).toBe("PERMISSION_DENIED");

		const providerHeaders = JSON.parse(String(event.provider_response_headers_json ?? "{}"));
		expect(providerHeaders["x-request-id"]).toBe("upstream-request-123");
		expect(String(providerHeaders.authorization)).toContain("[redacted");
	});

	it("emits provider/model and service-tier dimensions for monitor grouping", async () => {
		const ctx = {
			endpoint: "responses",
			capability: "responses",
			requestId: "req_monitor_dims_123",
			protocol: "openai",
			meta: {
				requestPath: "/v1/responses",
			},
			rawBody: {
				model: "minimax/minimax-m3",
				input: "hello",
				service_tier: "priority",
			},
			body: {
				model: "minimax/minimax-m3",
				input: "hello",
				service_tier: "priority",
			},
			model: "minimax/minimax-m3",
			workspaceId: "ws_monitor_dims_123",
			stream: false,
			providers: [
				{
					providerId: "novita",
					providerModelSlug: "MiniMax-M3",
					pricingCard: { id: "price_novita_minimax_m3" },
					providerStatus: "active",
					capabilityStatus: "active",
				},
			],
			pricing: {},
			gating: {
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
			},
			providerAttempts: [
				{
					attempt_number: 1,
					provider: "novita",
					endpoint: "responses",
					model: "minimax/minimax-m3",
					provider_model_slug: "MiniMax-M3",
					outcome: "upstream_non_2xx",
					duration_ms: 120,
					status: 502,
				},
			],
		} as unknown as PipelineContext;

		await emitGatewayRequestEvent({
			ctx,
			provider: "novita",
			statusCode: 502,
			success: false,
			errorCode: "upstream_error",
			errorMessage: "Provider failed.",
			errorStage: "execute",
			usage: {
				service_tier: "priority",
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			provider: "novita",
			model: "minimax/minimax-m3",
			service_tier_requested: "priority",
			service_tier: "priority",
			service_tier_observed: "priority",
			provider_model_slug: "MiniMax-M3",
			provider_model: "novita:minimax/minimax-m3",
			provider_model_service_tier: "novita:minimax/minimax-m3:priority",
			success: false,
			status_code: 502,
		});
	});

	it("omits null values and duplicate diagnostic fields from compact success events", async () => {
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			AXIOM_SUCCESS_SAMPLE_RATE: "1",
			AXIOM_DETAIL_SAMPLE_RATE: "0",
			AXIOM_SLOW_REQUEST_MS: "999999",
		} as any);

		await emitGatewayRequestEvent({
			requestId: "req_compact_obs_123",
			workspaceId: "ws_compact_obs_123",
			endpoint: "responses",
			model: "minimax/minimax-m3",
			statusCode: 200,
			success: true,
			gatewayResponse: {
				id: "req_compact_obs_123",
				output_text: "OK",
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			event_schema_version: "2026-07-22.1",
			event_type: "gateway.request",
			observability_detail_level: "compact",
			request_id: "req_compact_obs_123",
			generation_id: "req_compact_obs_123",
			workspace_id: "ws_compact_obs_123",
			model: "minimax/minimax-m3",
			status_code: 200,
			success: true,
		});
		expect(Object.values(event)).not.toContain(null);
		expect(Object.values(event)).not.toContain("null");
		expect(event.model_resolved).toBeUndefined();
		expect(event.observability_success_sample_rate).toBeUndefined();
		expect(event.observability_detail_sample_rate).toBeUndefined();
		expect(event.observability_slow_request_ms).toBeUndefined();
		expect(event.mapping_snapshot_json).toBeUndefined();
		expect(event.generation_context_json).toBeUndefined();
		expect(event.provider_candidates_status_json).toBeUndefined();
		expect(event.request_payload_redacted_json).toBeUndefined();
		expect(event.gateway_response_redacted_json).toBeUndefined();
	});

	it("retains a safe provider snapshot and attempt timeline on compact success events", async () => {
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			AXIOM_SUCCESS_SAMPLE_RATE: "1",
			AXIOM_DETAIL_SAMPLE_RATE: "0",
			AXIOM_SLOW_REQUEST_MS: "999999",
		} as any);

		const ctx = {
			requestId: "req_compact_provider_123",
			workspaceId: "ws_compact_provider_123",
			endpoint: "responses",
			capability: "responses",
			model: "openai/gpt-5-mini",
			stream: true,
			meta: {},
			providers: [{
				providerId: "openai-eu",
				providerFamilyId: "openai",
				offerScope: "regional",
				offerLabel: "European Union",
				dataPolicyVariant: "zdr",
				providerStatus: "active",
				providerRoutingStatus: "active",
				modelRoutingStatus: "active",
				capabilityStatus: "active",
				residencyMode: "customer_selectable",
				executionRegions: ["eu"],
				dataRegions: ["eu"],
				zeroDataRetention: "default",
				promptTrainingPolicy: "no_train",
				dataPolicyTier: "private",
				dataPolicyConfidence: "confirmed",
				dataPolicyContractMode: "customer_agreement",
				pricingCard: { id: "price_openai_eu" },
				byokMeta: [{ id: "byok_secret_id" }],
				providerModelSlug: "gpt-5-mini",
				inputModalities: ["text", "image"],
				outputModalities: ["text"],
				maxInputTokens: 128000,
				maxOutputTokens: 16384,
			}],
			providerAttempts: [{
				attempt_number: 1,
				provider: "openai-eu",
				endpoint: "responses",
				model: "openai/gpt-5-mini",
				api_model_id: "openai/gpt-5-mini",
				provider_model_slug: "gpt-5-mini",
				outcome: "success",
				duration_ms: 42,
				status: 200,
				key_source: "byok",
				byok_key_id: "byok_secret_id",
				credential_phase: "priority_byok",
				upstream_url: "https://api.openai.com/v1/responses?api_key=secret",
				response_kind: "stream",
				was_probe: true,
				request_build_ms: 0.4,
				upstream_headers_ms: 41,
				time_to_upstream_request_ms: 2.1,
				upstream_request_count: 1,
			}],
		} as unknown as PipelineContext;

		await emitGatewayRequestEvent({
			ctx,
			provider: "openai-eu",
			statusCode: 200,
			success: true,
		});

		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			observability_detail_level: "compact",
			provider: "openai-eu",
			provider_family_id: "openai",
			provider_offer_scope: "regional",
			provider_data_policy_variant: "zdr",
			provider_rollout_status: "active",
			provider_zero_data_retention: "default",
			provider_prompt_training_policy: "no_train",
			provider_pricing_available: true,
			provider_byok_key_count: 1,
			selected_attempt_number: 1,
			selected_key_source: "byok",
			selected_credential_phase: "priority_byok",
			selected_attempt_was_probe: true,
		});
		const timeline = JSON.parse(String(event.provider_attempt_timeline_json));
		expect(timeline).toEqual([expect.objectContaining({
			attempt_number: 1,
			provider: "openai-eu",
			outcome: "success",
			credential_phase: "priority_byok",
			key_source: "byok",
			was_probe: true,
		})]);
		expect(timeline[0].byok_key_id).toBeUndefined();
		expect(timeline[0].upstream_url).toBeUndefined();
		expect(event.provider_attempts_json).toBeUndefined();
	});

	it("emits compact success events by default without raw IP addresses", async () => {
		clearRuntime();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
		} as any);

		await emitGatewayRequestEvent({
			requestId: "req_default_success_obs_123",
			workspaceId: "ws_default_success_obs_123",
			endpoint: "responses",
			model: "openai/gpt-5-mini",
			statusCode: 200,
			success: true,
			clientIp: "203.0.113.10",
			cfRay: "test-ray-123",
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			observability_detail_level: "compact",
			observability_emit_reason: "sampled_success",
			request_id: "req_default_success_obs_123",
			generation_id: "req_default_success_obs_123",
			cf_ray: "test-ray-123",
			success: true,
		});
		expect(event.client_ip).toBeUndefined();
		expect(event.request_payload_redacted_json).toBeUndefined();
	});

	it("classifies request provider locks that exclude candidates as caller-owned", async () => {
		await emitGatewayRequestEvent({
			requestId: "req_provider_lock_obs_123",
			workspaceId: "ws_provider_lock_obs_123",
			endpoint: "responses",
			model: "minimax/minimax-m3",
			statusCode: 400,
			success: false,
			errorCode: "user:validation_error",
			errorMessage: "Workspace and request provider filters resulted in no available providers",
			errorStage: "before",
			gatewayResponse: {
				error: "validation_error",
				error_type: "user",
				error_origin: "user",
				error_operational_kind: "request_provider_filter_no_match",
				details: [{
					keyword: "no_providers_after_workspace_policy_filter",
					path: ["provider"],
				}],
				routing_diagnostics: {
					workspacePolicy: {
						resolvedModel: "minimax/minimax-m3",
						allowedApiModels: [],
						providerAllowlist: [],
						providerBlocklist: [],
						requestProviderOnly: ["novita"],
						requestProviderIgnore: [],
						activeGuardrailIds: [],
						beforeCount: 1,
						afterCount: 0,
					},
				},
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			error_type: "user",
			error_origin: "user",
			error_operational_kind: "request_provider_filter_no_match",
			error_action_owner: "caller",
			error_requires_investigation: false,
		});
	});

	it("classifies known model provider-candidate gaps as gateway-owned", async () => {
		await emitGatewayRequestEvent({
			requestId: "req_candidate_gap_obs_123",
			workspaceId: "ws_candidate_gap_obs_123",
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			statusCode: 400,
			success: false,
			errorCode: "upstream:unsupported_model_or_endpoint",
			errorMessage: "Unsupported model or endpoint.",
			errorStage: "before",
			gatewayResponse: {
				error: "unsupported_model_or_endpoint",
				error_type: "system",
				error_origin: "gateway",
				error_operational_kind: "gateway_provider_availability_gap",
				reason: "provider_candidates_unavailable",
				provider_candidate_diagnostics: {
					totalProviders: 2,
					supportsEndpointCount: 2,
					candidateCount: 0,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
				},
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event).toMatchObject({
			error_type: "system",
			error_origin: "gateway",
			error_operational_kind: "gateway_provider_availability_gap",
			error_action_owner: "gateway",
			error_requires_investigation: true,
		});
	});

	it("falls back to the requested model when early failures have no resolved model", async () => {
		await emitGatewayRequestEvent({
			requestId: "req_requested_model_obs_123",
			workspaceId: "ws_requested_model_obs_123",
			endpoint: "responses",
			requestedModel: "openai/gpt-5-nano",
			requestPayload: {
				model: "openai/gpt-5-nano",
				input: "hello",
			},
			statusCode: 400,
			success: false,
			errorCode: "user:validation_error",
			errorMessage: "Validation failed.",
			errorStage: "before",
			gatewayResponse: {
				error: "validation_error",
				details: [{ path: ["input"], message: "input is required" }],
			},
		});

		expect(sendAxiomWideEventMock).toHaveBeenCalledTimes(1);
		const event = sendAxiomWideEventMock.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(event.model).toBe("openai/gpt-5-nano");
		expect(event.model_requested).toBe("openai/gpt-5-nano");
		expect(event.request_payload_redacted_json).toContain("\"model\":\"openai/gpt-5-nano\"");
	});
});
