import { beforeEach, describe, expect, it, vi } from "vitest";
const emitGatewayRequestEventMock = vi.fn(async () => {});
vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: (...args: unknown[]) => emitGatewayRequestEventMock(...args),
}));
import {
	classifyErrorOrigin,
	classifyErrorType,
	extractUpstreamUnsupportedParamSignal,
	handleError,
} from "./error-handler";

beforeEach(() => {
	emitGatewayRequestEventMock.mockReset();
});

describe("extractUpstreamUnsupportedParamSignal", () => {
	it("returns null for before-stage errors", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "before",
			body: {
				error: "validation_error",
				details: [{ keyword: "unsupported_param", path: ["temperature"] }],
			},
		});
		expect(signal).toBeNull();
	});

	it("extracts unsupported param code/path from execute-stage details", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: "validation_error",
				details: [{
					keyword: "unsupported_param",
					path: ["reasoning", "effort"],
					params: { param: "reasoning.effort" },
				}],
			},
		});

		expect(signal).toEqual({
			internalCode: "UPSTREAM_UNSUPPORTED_PARAM",
			param: "reasoning.effort",
			path: "reasoning.effort",
			keyword: "unsupported_param",
		});
	});

	it("extracts combo code when upstream returns unsupported_param_combo", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: "validation_error",
				details: [{
					keyword: "unsupported_param_combo",
					path: ["parameters"],
					message: "No provider supports all requested parameters",
				}],
			},
		});

		expect(signal?.internalCode).toBe("UPSTREAM_UNSUPPORTED_PARAM_COMBO");
		expect(signal?.path).toBe("parameters");
	});

	it("falls back to message heuristics when details are absent", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: {
					code: "invalid_request",
					message: "Provider does not support parameter \"instructions\" on this endpoint.",
				},
			},
		});

		expect(signal?.internalCode).toBe("UPSTREAM_UNSUPPORTED_PARAM");
		expect(signal?.param).toBe("instructions");
	});

	it("extracts unsupported param signal from failure_sample diagnostics", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: "upstream_error",
				failure_sample: [{
					upstream_error_message: "Param Incorrect",
					upstream_error_param:
						"Unknown voice: mimo_Default. Available voices: [mimo_default, default_zh, default_en]",
				}],
			},
		});

		expect(signal?.internalCode).toBe("UPSTREAM_UNSUPPORTED_PARAM");
		expect(signal?.param).toContain("Unknown voice");
	});
});

describe("handleError", () => {
	it("preserves before-stage system labels from provider candidate gaps", async () => {
		expect(classifyErrorType({
			stage: "before",
			status: 400,
			errorCode: "unsupported_model_or_endpoint",
			body: {
				error_type: "system",
				error_origin: "gateway",
			},
		})).toBe("system");
		expect(classifyErrorOrigin({
			stage: "before",
			status: 400,
			errorCode: "unsupported_model_or_endpoint",
			body: {
				error_type: "system",
				error_origin: "gateway",
			},
		})).toBe("gateway");
	});

	it("preserves execute upstream diagnostics for client debugging", async () => {
		let capturedAuditArgs: any = null;
		const upstream = new Response(
			JSON.stringify({
				error: "upstream_error",
				reason: "all_candidates_failed",
				description: "Provider failed.",
				provider_failure_diagnostics: {
					category: "credentials_not_configured",
					hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
					provider: "xiaomi",
				},
				routing_diagnostics: {
					filterStages: [{
						stage: "capability_status_gate",
						beforeCount: 1,
						afterCount: 0,
						droppedProviders: [{
							providerId: "xiaomi",
							reason: "capability_status_internal_testing_requires_testing_mode",
						}],
					}],
				},
				attempt_count: 1,
				failed_providers: ["xiaomi"],
				failed_statuses: [400],
				failure_sample: [{
					provider: "xiaomi",
					type: "upstream_non_2xx",
					status: 400,
					upstream_error_code: "400",
					upstream_error_message: "Param Incorrect",
					upstream_error_param: "voice",
					upstream_payload_preview: "{\"error\":{\"message\":\"Param Incorrect\"}}",
					retryable: false,
				}],
			}),
			{ status: 502, headers: { "content-type": "application/json" } },
		);

		const res = await handleError({
			stage: "execute",
			res: upstream,
			endpoint: "audio.speech",
			ctx: {
				requestId: "G-TEST-1",
				model: "xiaomi/mimo-v2-tts:free",
				rawBody: {
					model: "xiaomi/mimo-v2-tts:free",
					input: [{ role: "user", content: "say hello" }],
				},
			} as any,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});
			const payload = await res.json();
			expect(payload.error).toBe("upstream_error");
			expect(payload.error_origin).toBe("upstream");
			expect(payload.reason).toBe("all_candidates_failed");
			expect(payload.attempt_count).toBe(1);
			expect(payload.failed_providers).toEqual(["xiaomi"]);
			expect(payload.failed_statuses).toEqual([400]);
		expect(payload.routing_diagnostics).toEqual({
			filterStages: [{
				stage: "capability_status_gate",
				beforeCount: 1,
				afterCount: 0,
				droppedProviders: [{
					providerId: "xiaomi",
					reason: "capability_status_internal_testing_requires_testing_mode",
				}],
			}],
		});
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "credentials_not_configured",
			hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
			provider: "xiaomi",
		});
		expect(payload.upstream_error).toEqual({
			code: "400",
			message: "Param Incorrect",
			description: null,
			param: "voice",
		});
		expect(payload.failure_sample).toEqual([{
			provider: "xiaomi",
			type: "upstream_non_2xx",
			status: 400,
			upstream_error_code: "400",
			upstream_error_message: "Param Incorrect",
			upstream_error_description: null,
			upstream_error_param: "voice",
			upstream_payload_preview: "{\"error\":{\"message\":\"Param Incorrect\"}}",
			retryable: false,
		}]);
		expect(capturedAuditArgs?.errorPayload).toMatchObject({
			error: "upstream_error",
			reason: "all_candidates_failed",
			provider_failure_diagnostics: {
				category: "credentials_not_configured",
				provider: "xiaomi",
			},
			routing_diagnostics: {
				filterStages: [
					{
						stage: "capability_status_gate",
						beforeCount: 1,
						afterCount: 0,
					},
				],
			},
			upstream_error: {
				code: "400",
				message: "Param Incorrect",
				param: "voice",
			},
			failure_sample: [
				expect.objectContaining({
					provider: "xiaomi",
					upstream_error_code: "400",
				}),
			],
		});
		expect(capturedAuditArgs?.requestPayload).toEqual({
			model: "xiaomi/mimo-v2-tts:free",
			input: [{ role: "user", content: "say hello" }],
		});
	});

	it("stores the original request body for replay on execute-stage failures", async () => {
		let capturedAuditArgs: any = null;
		const upstream = new Response(
			JSON.stringify({
				error: "upstream_error",
				description: "Provider failed.",
				reason: "all_candidates_failed",
			}),
			{ status: 502, headers: { "content-type": "application/json" } },
		);

		await handleError({
			stage: "execute",
			res: upstream,
			endpoint: "responses",
			ctx: {
				requestId: "G-TEST-REPLAY",
				model: "openai/gpt-5.4-nano",
				body: {
					model: "openai/gpt-5.4-nano",
					input: "retry me",
				},
			} as any,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		expect(capturedAuditArgs?.requestPayload).toEqual({
			model: "openai/gpt-5.4-nano",
			input: "retry me",
		});
		expect(capturedAuditArgs?.providerResponse).toEqual({
			error: "upstream_error",
			description: "Provider failed.",
			reason: "all_candidates_failed",
		});
		expect(capturedAuditArgs?.detailMetadata).toMatchObject({
			replay_supported: true,
			stage: "execute",
		});
	});

	it("surfaces unsupported model diagnostics from before-stage guards", async () => {
		let capturedAuditArgs: any = null;
		const upstream = new Response(
			JSON.stringify({
				error: "unsupported_model_or_endpoint",
				error_type: "system",
				error_origin: "gateway",
				error_operational_kind: "gateway_provider_availability_gap",
				reason: "pricing_not_configured",
				description: "Unsupported model or endpoint.",
				provider_candidate_diagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					candidateCount: 1,
					droppedUnsupportedEndpoint: ["anthropic"],
					droppedMissingAdapter: [
						{
							providerId: "openai",
							endpoint: "moderations",
						},
					],
				},
				provider_enablement: {
					capability: "moderations",
					providersBefore: ["openai"],
					providersAfter: [],
					dropped: [{ providerId: "openai", reason: "pricing_missing" }],
				},
				missing_pricing_providers: ["openai"],
			}),
			{ status: 400, headers: { "content-type": "application/json" } },
		);

		const res = await handleError({
			stage: "before",
			res: upstream,
			endpoint: "moderations",
			ctx: {
				requestId: "G-TEST-2",
				model: "openai/omni-moderation",
			} as any,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});
			const payload = await res.json();
			expect(payload.error).toBe("unsupported_model_or_endpoint");
			expect(payload.error_type).toBe("system");
			expect(payload.error_origin).toBe("gateway");
			expect(payload.error_operational_kind).toBe("gateway_provider_availability_gap");
			expect(payload.reason).toBe("pricing_not_configured");
			expect(payload.provider_candidate_diagnostics).toEqual({
				totalProviders: 1,
				supportsEndpointCount: 1,
				candidateCount: 1,
				droppedUnsupportedEndpoint: ["anthropic"],
				droppedMissingAdapter: [
					{
						providerId: "openai",
						endpoint: "moderations",
					},
				],
			});
		expect(payload.provider_enablement).toEqual({
			capability: "moderations",
			providersBefore: ["openai"],
			providersAfter: [],
			dropped: [{ providerId: "openai", reason: "pricing_missing" }],
		});
		expect(payload.missing_pricing_providers).toEqual(["openai"]);
		expect(capturedAuditArgs?.errorPayload).toMatchObject({
			error: "unsupported_model_or_endpoint",
			error_type: "system",
			error_origin: "gateway",
			error_operational_kind: "gateway_provider_availability_gap",
			reason: "pricing_not_configured",
			provider_candidate_diagnostics: {
				totalProviders: 1,
				supportsEndpointCount: 1,
				candidateCount: 1,
			},
			provider_enablement: {
				capability: "moderations",
				providersBefore: ["openai"],
				providersAfter: [],
			},
			missing_pricing_providers: ["openai"],
		});
	});

	it("recovers the requested model from the original before-stage request", async () => {
		let capturedAuditArgs: any = null;
		const upstream = new Response(
			JSON.stringify({
				error: "validation_error",
				description: "Validation failed.",
				details: [{ path: ["input"], message: "input is required", keyword: "invalid_type" }],
			}),
			{ status: 400, headers: { "content-type": "application/json" } },
		);
		const req = new Request("https://example.test/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "openai/gpt-5-nano",
				extra_field: true,
			}),
		});

		await handleError({
			stage: "before",
			res: upstream,
			endpoint: "responses",
			req,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		expect(capturedAuditArgs?.model).toBe("openai/gpt-5-nano");
		expect(capturedAuditArgs?.requestedModel).toBe("openai/gpt-5-nano");
		expect(capturedAuditArgs?.requestPayload).toEqual({
			model: "openai/gpt-5-nano",
			extra_field: true,
		});
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "openai/gpt-5-nano",
				requestedModel: "openai/gpt-5-nano",
			}),
		);
	});

	it("captures malformed early request payloads for observability", async () => {
		let capturedAuditArgs: any = null;
		const upstream = new Response(
			JSON.stringify({
				error: "invalid_json",
				description: "Invalid JSON body.",
			}),
			{ status: 400, headers: { "content-type": "application/json" } },
		);
		const req = new Request("https://example.test/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: '{"model":"anthropic/claude-sonnet-4","input":"hi",}',
		});

		await handleError({
			stage: "before",
			res: upstream,
			endpoint: "responses",
			req,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		expect(capturedAuditArgs?.model).toBe("anthropic/claude-sonnet-4");
		expect(capturedAuditArgs?.requestedModel).toBe("anthropic/claude-sonnet-4");
		expect(capturedAuditArgs?.requestPayload).toMatchObject({
			_content_type: "application/json",
			_invalid_json: true,
			_body_length_chars: '{"model":"anthropic/claude-sonnet-4","input":"hi",}'.length,
			_model_hint: "anthropic/claude-sonnet-4",
		});
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "anthropic/claude-sonnet-4",
				requestedModel: "anthropic/claude-sonnet-4",
			}),
		);
	});

	it("marks pipeline execution failures as gateway-origin errors", async () => {
		const upstream = new Response(
			JSON.stringify({
				error: "pipeline_execution_error",
				description: "Internal pipeline execution error.",
			}),
			{ status: 500, headers: { "content-type": "application/json" } },
		);

		const res = await handleError({
			stage: "execute",
			res: upstream,
			endpoint: "responses",
			ctx: {
				requestId: "G-TEST-3",
				model: "google/lyria-3-clip-preview",
			} as any,
			auditFailure: async () => { },
		});
		const payload = await res.json();
		expect(payload.error).toBe("pipeline_execution_error");
		expect(payload.error_type).toBe("system");
		expect(payload.error_origin).toBe("gateway");
		expect(res.headers.get("X-Gateway-Error-Origin")).toBe("gateway");
	});
});

