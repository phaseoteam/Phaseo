import { beforeEach, describe, expect, it, vi } from "vitest";
const emitGatewayRequestEventMock = vi.fn(async () => {});
vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: (...args: unknown[]) => emitGatewayRequestEventMock(...args),
}));
const enqueueGatewayOtlpExportMock = vi.hoisted(() => vi.fn(async (_input: any) => {}));
vi.mock("@observability/otlp-export", () => ({
	enqueueGatewayOtlpExport: (input: unknown) => enqueueGatewayOtlpExportMock(input),
}));
const background = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { background.push(promise.catch(() => undefined)); },
}));
import {
	classifyAttribution,
	classifyErrorOrigin,
	classifyErrorType,
	extractUpstreamUnsupportedParamSignal,
	handleError as handleErrorWithoutWaiting,
} from "./error-handler";

// Audits are delivered in the background; wait for them before asserting.
async function handleError(...args: Parameters<typeof handleErrorWithoutWaiting>) {
	const response = await handleErrorWithoutWaiting(...args);
	await Promise.all(background.splice(0));
	return response;
}

beforeEach(() => {
	emitGatewayRequestEventMock.mockReset();
	enqueueGatewayOtlpExportMock.mockClear();
	background.length = 0;
});

describe("background failure audits", () => {
	it("returns the error response without waiting for audit persistence", async () => {
		let finishAudit!: () => void;
		const auditDone = new Promise<void>((resolve) => { finishAudit = resolve; });
		const response = await handleErrorWithoutWaiting({
			stage: "before",
			res: new Response(JSON.stringify({ error: "invalid_request" }), { status: 400 }),
			endpoint: "chat.completions",
			auditFailure: () => auditDone,
		});

		expect(response.status).toBe(400);
		expect(background).toHaveLength(1);
		finishAudit();
		await Promise.all(background.splice(0));
	});
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
	it("logs a Phaseo free-model limit without provider attribution and preserves Retry-After", async () => {
		let capturedAuditArgs: any = null;
		const response = await handleError({
			stage: "execute",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "phaseo_free_model_limit_exceeded",
				error_type: "user",
				error_origin: "gateway",
				description: "Phaseo free-model daily limit reached.",
			}), { status: 429, headers: { "Retry-After": "3600", "Authorization": "private" } }),
			ctx: { requestId: "G-FREE-LIMIT", workspaceId: "workspace", model: "phaseo/free", meta: {}, providers: [{ providerId: "gmicloud" }] } as any,
			auditFailure: async (args) => { capturedAuditArgs = args; },
		});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("3600");
		expect(response.headers.get("X-Gateway-Error-Attribution")).toBe("user");
		expect(response.headers.get("Authorization")).toBeNull();
		expect(await response.json()).toMatchObject({ code: "phaseo_free_model_limit_exceeded", error_origin: "gateway", error_type: "user" });
		expect(capturedAuditArgs).toMatchObject({ errorCode: "gateway:phaseo_free_model_limit_exceeded", provider: null });
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "gateway:phaseo_free_model_limit_exceeded", provider: null }));
	});

	it("keeps BYOK upstream quota headers and the throttling status when every provider returned 429", async () => {
		const response = await handleError({
			stage: "execute",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "upstream_error",
				reason: "all_candidates_failed",
				attempt_count: 1,
				failed_statuses: [429],
			}), {
				status: 429,
				headers: {
					"Retry-After": "9",
					"X-Phaseo-Upstream-RateLimit-Remaining-Requests": "0",
					// A provider header name is never forwarded.
					"x-ratelimit-remaining-tokens": "100",
				},
			}),
			ctx: { requestId: "G-BYOK-429", workspaceId: "workspace", model: "openai/gpt-oss-120b", meta: {}, providers: [{ providerId: "deepinfra" }] } as any,
			auditFailure: async () => {},
		});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("9");
		expect(response.headers.get("X-Phaseo-Upstream-RateLimit-Remaining-Requests")).toBe("0");
		expect(response.headers.get("x-ratelimit-remaining-tokens")).toBeNull();
		expect(await response.json()).toMatchObject({ status_code: 429, code: "upstream_error", error_origin: "upstream" });
	});

	it("attributes a rate limit policy rejection to the caller and keeps the policy fields", async () => {
		let capturedAuditArgs: any = null;
		const response = await handleError({
			stage: "execute",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "rate_limit_exceeded",
				error_type: "user",
				error_origin: "user",
				reason: "policy_requests_per_minute",
				policy_id: "policy-1",
				limit_scope: "key",
				description: "This API key reached the \"Strict\" rate limit policy's 2 requests per minute. Retry after 9 seconds.",
			}), { status: 429, headers: { "Retry-After": "9" } }),
			ctx: { requestId: "G-POLICY-LIMIT", workspaceId: "workspace", model: "openai/gpt-5", meta: {}, providers: [{ providerId: "openai" }] } as any,
			auditFailure: async (args) => { capturedAuditArgs = args; },
		});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("9");
		expect(response.headers.get("X-Gateway-Error-Attribution")).toBe("user");
		expect(await response.json()).toMatchObject({
			code: "rate_limit_exceeded", error_origin: "user", reason: "policy_requests_per_minute", policy_id: "policy-1", limit_scope: "key",
		});
		expect(capturedAuditArgs).toMatchObject({ errorCode: "user:rate_limit_exceeded", provider: null });
	});

	it("preserves guardrail enforcement metadata on blocked before-stage requests", async () => {
		let capturedAuditArgs: any = null;
		const blocked = new Response(
			JSON.stringify({
				error: "guardrail_blocked",
				reason: "prompt_injection_detected",
				description: "Request blocked by prompt injection guardrail.",
				request_id: "G-GUARDRAIL-1",
				workspace_id: "workspace-1",
				guardrail_enforcement: {
					source: "prompt_injection",
					action: "block",
					guardrail_ids: ["guardrail-1"],
					detection_count: 1,
				},
				guardrail: {
					type: "content_safety",
					scope: "workspace",
				},
			}),
			{ status: 403, headers: { "content-type": "application/json" } },
		);

		const response = await handleError({
			stage: "before",
			res: blocked,
			endpoint: "responses",
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		const payload = await response.json();
		expect(payload.guardrail_enforcement).toEqual({
			source: "prompt_injection",
			action: "block",
			guardrail_ids: ["guardrail-1"],
			detection_count: 1,
		});
		expect(payload.guardrail).toEqual({
			type: "content_safety",
			scope: "workspace",
		});
		expect(capturedAuditArgs?.errorPayload).toMatchObject({
			guardrail_enforcement: {
				source: "prompt_injection",
				action: "block",
				guardrail_ids: ["guardrail-1"],
			},
			guardrail: {
				type: "content_safety",
				scope: "workspace",
			},
		});
	});

	it("attributes only policy rejections, not provider rate_limit_exceeded 429s, to the caller", () => {
		const policy = { stage: "execute" as const, status: 429, errorCode: "rate_limit_exceeded", body: { error: "rate_limit_exceeded", reason: "policy_requests_per_minute" } };
		const provider = { stage: "execute" as const, status: 429, errorCode: "rate_limit_exceeded", body: { error: { code: "rate_limit_exceeded", message: "Too many requests" } } };
		expect(classifyAttribution(policy)).toBe("user");
		expect(classifyAttribution(provider)).toBe(classifyAttribution({ ...provider, errorCode: "upstream_error" }));
	});

	it("classifies region and residency 403s as user errors", () => {
		for (const reason of ["all_routes_unavailable_in_request_country", "no_provider_in_required_region"]) {
			const args = { stage: "execute" as const, status: 403, errorCode: "model_region_unavailable", body: { reason } };
			expect(classifyErrorType(args)).toBe("user");
			expect(classifyErrorOrigin(args)).toBe("user");
		}
		// Other 403s keep the gateway ops policy.
		expect(classifyErrorType({ stage: "execute", status: 403, errorCode: "forbidden", body: {} })).toBe("system");
	});

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
				meta: {},
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
			expect(payload.code).toBe("upstream_error");
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
			code: "upstream_error",
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
				meta: {},
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

	it("keeps the suggested model on retired model errors", async () => {
		const upstream = new Response(
			JSON.stringify({
				error: "model_retired",
				error_type: "user",
				error_origin: "user",
				error_operational_kind: "retired_model",
				reason: "model_retired_without_providers",
				description: 'Model "a/b" was retired on 2026-10-01 and no provider serves it any more. Use "a/c" instead.',
				model: "a/b",
				retired_at: "2026-10-01T00:00:00Z",
				replacement_model: "a/c",
			}),
			{ status: 410, headers: { "content-type": "application/json" } },
		);

		const res = await handleError({
			stage: "before",
			res: upstream,
			endpoint: "chat.completions",
			ctx: { requestId: "G-TEST-RETIRED", meta: {}, model: "a/b" } as any,
			auditFailure: async () => undefined,
		});

		expect(res.status).toBe(410);
		expect(await res.json()).toMatchObject({
			code: "model_retired",
			error_type: "user",
			description: 'Model "a/b" was retired on 2026-10-01 and no provider serves it any more. Use "a/c" instead.',
			model: "a/b",
			retired_at: "2026-10-01T00:00:00Z",
			replacement_model: "a/c",
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
				meta: {},
				model: "openai/omni-moderation",
			} as any,
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});
			const payload = await res.json();
			expect(payload.code).toBe("unsupported_model_or_endpoint");
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
			code: "unsupported_model_or_endpoint",
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

	it("recovers the requested model from the bounded before-stage request clone", async () => {
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
		const requestBodyReq = req.clone();

		await handleError({
			stage: "before",
			res: upstream,
			endpoint: "responses",
			req,
			requestBodyReq,
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

	it("does not read an uncapped original request when the bounded clone is unavailable", async () => {
		const req = new Request("https://example.test/v1/responses", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: JSON.stringify({ model: "openai/gpt-5-nano", input: "private prompt" }),
		});

		await handleError({
			stage: "before",
			res: new Response(JSON.stringify({
				error: "unauthorised",
				reason: "invalid_api_key",
			}), { status: 401, headers: { "content-type": "application/json" } }),
			endpoint: "responses",
			req,
			auditFailure: async () => {},
		});

		expect(req.bodyUsed).toBe(false);
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(expect.objectContaining({
			model: null,
			requestedModel: null,
			requestPayload: null,
			requestMethod: "POST",
			requestPath: "/v1/responses",
		}));
	});

	it("uses the parsed request snapshot after the request body has been consumed", async () => {
		let capturedAuditArgs: any = null;
		const requestPayload = {
			model: "openai/gpt-5-nano",
			input: "private prompt",
		};
		const req = new Request("https://example.test/v1/responses", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: JSON.stringify(requestPayload),
		});
		await req.text();

		await handleError({
			stage: "before",
			res: new Response(JSON.stringify({
				error: "insufficient_funds",
				reason: "insufficient_funds",
				min_usd: 1,
			}), { status: 402, headers: { "content-type": "application/json" } }),
			endpoint: "responses",
			req,
			requestObservability: {
				requestPayload,
				requestedModel: "openai/gpt-5-nano",
				model: "openai/gpt-5-nano",
			},
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		expect(capturedAuditArgs).toMatchObject({
			model: "openai/gpt-5-nano",
			requestedModel: "openai/gpt-5-nano",
			requestPayload,
			requestMethod: "POST",
			requestPath: "/v1/responses",
		});
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(expect.objectContaining({
			model: "openai/gpt-5-nano",
			requestedModel: "openai/gpt-5-nano",
			requestPayload,
			requestMethod: "POST",
			requestPath: "/v1/responses",
		}));
	});

	it("keeps the authenticated key and workspace on failures before the request context exists", async () => {
		let capturedAuditArgs: any = null;
		await handleError({
			stage: "before",
			res: new Response(JSON.stringify({ error: "unsupported_model" }), { status: 400, headers: { "content-type": "application/json" } }),
			endpoint: "responses",
			requestObservability: {
				requestPayload: { model: "openai/gpt-5-nano", input: "private prompt" },
				requestedModel: "openai/gpt-5-nano",
				workspaceId: "ws_agent",
				apiKeyId: "key_agent",
			},
			auditFailure: async (args) => {
				capturedAuditArgs = args;
			},
		});

		// The audit, telemetry and broadcast paths read the key's data policy from these.
		expect(capturedAuditArgs).toMatchObject({ workspaceId: "ws_agent", keyId: "key_agent" });
		expect(emitGatewayRequestEventMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_agent", keyId: "key_agent" }));
	});

	it("keeps content out of the telemetry for a failure before the request context exists when the key requires ZDR", async () => {
		// The real telemetry event, with the key's guardrail requiring zero data retention.
		const sendAxiomWideEvent = vi.fn(async (_event: Record<string, unknown>) => {});
		vi.resetModules();
		vi.doUnmock("@observability/events");
		vi.doMock("@observability/axiom", () => ({
			sendAxiomWideEvent,
			emitGatewayTelemetryDeliveryFailure: async () => {},
			emitGatewayOperationalFailure: async () => {},
		}));
		vi.doMock("@/pipeline/before/workspacePolicy", () => ({
			fetchWorkspacePolicy: async () => ({ privacyZdrOnly: true, neverStoreContent: false }),
		}));
		// Broadcasts (the customer's own destination) are not under test and would hit the network.
		vi.doMock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => {} }));
		try {
			const env = await import("@/runtime/env");
			env.configureRuntime({
				SUPABASE_URL: "https://example.supabase.co",
				SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
				GATEWAY_CACHE: {} as KVNamespace,
				NODE_ENV: "test",
				AXIOM_API_KEY: "axiom_test_key",
				AXIOM_DATASET: "gateway-wide",
				AXIOM_DETAIL_SAMPLE_RATE: "1",
			} as any);
			const { handleError: handleWithTelemetry } = await import("./error-handler");
			await handleWithTelemetry({
				stage: "before",
				res: new Response(JSON.stringify({ error: "no_zero_data_retention_provider", input: "private echoed prompt" }), {
					status: 400,
					headers: { "content-type": "application/json" },
				}),
				endpoint: "responses",
				requestObservability: {
					requestPayload: { model: "openai/gpt-5-nano", input: "private prompt" },
					requestedModel: "openai/gpt-5-nano",
					workspaceId: "ws_zdr",
					apiKeyId: "key_zdr_guardrail",
				},
				auditFailure: async () => {},
			});
			await Promise.all(background.splice(0));
			env.clearRuntime();
		} finally {
			vi.doUnmock("@observability/axiom");
			vi.doUnmock("@/pipeline/before/workspacePolicy");
			vi.doUnmock("@observability/otlp-export");
			vi.resetModules();
		}

		const event = sendAxiomWideEvent.mock.calls.map((call) => call[0]).find((entry) => entry.event_type !== "gateway.telemetry_delivery");
		expect(event).toMatchObject({ observability_detail_level: "full", key_id: "key_zdr_guardrail", workspace_id: "ws_zdr", status_code: 400 });
		expect(event?.request_payload_redacted_json).toBeUndefined();
		expect(event?.gateway_response_redacted_json).toBeUndefined();
		expect(event?.provider_response_redacted_json).toBeUndefined();
		expect(event?.error_details_redacted_json).toBeUndefined();
		expect(JSON.stringify(event)).not.toContain("private");
	});

	it("exports request metadata and its trace keys on failures before the request context exists", async () => {
		const run = async (headers: Record<string, string>) => {
			enqueueGatewayOtlpExportMock.mockClear();
			await handleError({
				stage: "before",
				res: new Response(JSON.stringify({ error: "insufficient_credits" }), { status: 402, headers: { "content-type": "application/json" } }),
				endpoint: "chat.completions",
				req: new Request("https://example.test/v1/chat/completions", { method: "POST", headers }),
				requestObservability: {
					requestPayload: { model: "openai/gpt-5-nano", metadata: { trace_id: "conversation-42", span_name: "checkout" } },
					requestedModel: "openai/gpt-5-nano",
					workspaceId: "ws_agent",
					apiKeyId: "key_agent",
				},
				auditFailure: async () => {},
			});
			return enqueueGatewayOtlpExportMock.mock.calls[0]?.[0];
		};

		const fromMetadata = await run({});
		expect(fromMetadata?.metadata).toEqual({ trace_id: "conversation-42", span_name: "checkout" });
		expect(fromMetadata?.traceContext?.traceId).toMatch(/^[0-9a-f]{32}$/);

		const fromHeader = await run({ traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01" });
		expect(fromHeader?.traceContext).toMatchObject({ traceId: "0af7651916cd43dd8448eb211c80319c", parentSpanId: "b7ad6b7169203331" });
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
		const requestBodyReq = req.clone();

		await handleError({
			stage: "before",
			res: upstream,
			endpoint: "responses",
			req,
			requestBodyReq,
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
				meta: {},
				model: "google/lyria-3-clip-preview",
			} as any,
			auditFailure: async () => { },
		});
		const payload = await res.json();
		expect(payload.code).toBe("pipeline_execution_error");
		expect(payload.error_type).toBe("system");
		expect(payload.error_origin).toBe("gateway");
		expect(res.headers.get("X-Gateway-Error-Origin")).toBe("gateway");
	});
});

describe("handleError error object", () => {
	it("returns validation failures with an invalid_request_error object and the old top-level fields", async () => {
		const response = await handleError({
			stage: "before",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "validation_error",
				message: "Unknown parameter: foo",
				details: [{ message: "Unknown parameter", path: ["foo"] }],
			}), { status: 400 }),
			ctx: { requestId: "G-VALIDATION", meta: {} } as any,
			auditFailure: async () => {},
		});
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toEqual({
			code: "validation_error",
			message: "Unknown parameter: foo",
			type: "invalid_request_error",
			param: "foo",
		});
		expect(body).toMatchObject({
			code: "validation_error",
			message: "Unknown parameter: foo",
			description: "Unknown parameter: foo",
			status_code: 400,
			generation_id: "G-VALIDATION",
			error_type: "user",
		});
	});

	it("returns auth failures as authentication_error", async () => {
		const response = await handleError({
			stage: "before",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({ error: "unauthorised", message: "Invalid API key." }), { status: 401 }),
			auditFailure: async () => {},
		});
		const body = await response.json();
		expect(body.error).toMatchObject({ code: "unauthorised", message: "Invalid API key.", type: "authentication_error" });
		expect(body).toMatchObject({ code: "unauthorised", status_code: 401, message: "Invalid API key." });
	});

	it("returns rate limits as rate_limit_error with Retry-After in metadata", async () => {
		const response = await handleError({
			stage: "execute",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "rate_limit_exceeded",
				error_origin: "user",
				reason: "policy_requests_per_minute",
				policy_id: "policy-1",
				limit_scope: "key",
				description: "Retry after 9 seconds.",
			}), { status: 429, headers: { "Retry-After": "9" } }),
			ctx: { requestId: "G-LIMIT", workspaceId: "workspace", meta: {} } as any,
			auditFailure: async () => {},
		});
		const body = await response.json();
		expect(body.error).toEqual({
			code: "rate_limit_exceeded",
			message: "Retry after 9 seconds.",
			type: "rate_limit_error",
			param: null,
			metadata: {
				reason: "policy_requests_per_minute",
				policy_id: "policy-1",
				limit_scope: "key",
				retry_after_seconds: 9,
			},
		});
		expect(body).toMatchObject({ code: "rate_limit_exceeded", status_code: 429, policy_id: "policy-1" });
	});

	it.each([
		[502, "server_error"],
		[503, "service_unavailable"],
		[529, "overloaded"],
	])("returns upstream %i failures with the provider detail in metadata", async (status, type) => {
		const response = await handleError({
			stage: "execute",
			endpoint: "chat.completions",
			res: new Response(JSON.stringify({
				error: "upstream_error",
				reason: "all_candidates_failed",
				attempt_count: 1,
				failed_providers: ["openai"],
				failed_statuses: [status],
				description: "All providers failed.",
			}), { status }),
			ctx: { requestId: "G-UPSTREAM", workspaceId: "workspace", meta: {} } as any,
			auditFailure: async () => {},
		});
		expect(response.status).toBe(status);
		const body = await response.json();
		expect(body.error).toEqual({
			code: "upstream_error",
			message: "All providers failed.",
			type,
			param: null,
			metadata: {
				reason: "all_candidates_failed",
				attempt_count: 1,
				failed_providers: ["openai"],
				failed_statuses: [status],
			},
		});
		expect(body).toMatchObject({
			code: "upstream_error",
			status_code: status,
			error_origin: "upstream",
			failed_providers: ["openai"],
		});
	});
});
