import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn();
const isLocalTestingModeEnabledMock = vi.fn();
const ensureAppIdMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();
const resolveGatewayIoLoggingPolicyMock = vi.fn();
const persistGatewayIoLogMock = vi.fn();
const persistGatewayUpstreamRequestsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: any[]) => getSupabaseAdminMock(...args),
	ensureRuntimeForBackground: (...args: any[]) => ensureRuntimeForBackgroundMock(...args),
	isLocalTestingModeEnabled: (...args: any[]) => isLocalTestingModeEnabledMock(...args),
}));

vi.mock("../after/apps", () => ({
	ensureAppId: (...args: any[]) => ensureAppIdMock(...args),
}));

vi.mock("@core/workspace-usage-rollups", () => ({
	syncWorkspaceUsageRollupForRequest: (...args: any[]) =>
		syncWorkspaceUsageRollupForRequestMock(...args),
}));

vi.mock("./io-logging", () => ({
	resolveGatewayIoLoggingPolicy: (...args: any[]) => resolveGatewayIoLoggingPolicyMock(...args),
	persistGatewayIoLog: (...args: any[]) => persistGatewayIoLogMock(...args),
}));

vi.mock("./upstream-requests", () => ({
	persistGatewayUpstreamRequests: (...args: any[]) => persistGatewayUpstreamRequestsMock(...args),
}));

import { auditFailure, auditSuccess, resolveAuditServiceTiers } from "./index";

describe("audit service tier attribution", () => {
	it("keeps requests without requested or observed tier evidence unclassified", () => {
		expect(resolveAuditServiceTiers({ endpoint: "chat.completions" })).toEqual({
			requested: null,
			observed: null,
			effective: null,
		});
	});
});

describe("audit request detail persistence", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReset();
		isLocalTestingModeEnabledMock.mockReset();
		ensureAppIdMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();
		resolveGatewayIoLoggingPolicyMock.mockReset();
		persistGatewayIoLogMock.mockReset();
		persistGatewayUpstreamRequestsMock.mockReset();
		persistGatewayUpstreamRequestsMock.mockResolvedValue(undefined);
		ensureRuntimeForBackgroundMock.mockReturnValue(() => {});
		isLocalTestingModeEnabledMock.mockReturnValue(false);
		ensureAppIdMock.mockResolvedValue("app_resolved");
		syncWorkspaceUsageRollupForRequestMock.mockResolvedValue(undefined);
		resolveGatewayIoLoggingPolicyMock.mockResolvedValue({
			featureEnabled: true,
			captureEnabled: true,
			settings: { enabled: true, retentionDays: 90, includeProviderPayloads: true },
		});
		persistGatewayIoLogMock.mockResolvedValue(undefined);
	});

	it("stores replay-ready details for successful requests", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		ensureAppIdMock.mockResolvedValueOnce(null);

		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_1", error: null })),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn((row: any) => {
							gatewayRequestRows.push(row);
							return {
								select: vi.fn(() => ({
									single: vi.fn(async () => ({
										data: {
											id: "row_1",
											created_at: "2026-05-05T12:00:00.000Z",
											workspace_id: "ws_1",
										},
										error: null,
									})),
								})),
							};
						}),
					};
				}

				if (table === "gateway_request_details") {
					return {
						insert: vi.fn(async (row: any) => {
							detailRows.push(row);
							return { error: null };
						}),
					};
				}

				throw new Error(`unexpected table ${table}`);
			}),
		});

		await auditSuccess({
			requestId: "req_success_1",
			workspaceId: "ws_1",
			provider: "openai",
			model: "phaseo/free",
			requestedModel: "phaseo/free",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			labels: [{ key: "team", value: "support" }],
			usagePriced: { prompt_tokens: 2, completion_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			totalNanos: 1000000,
			currency: "USD",
			statusCode: 200,
			requestPayload: {
				model: "openai/gpt-5-nano",
				messages: [{ role: "user", content: "hello" }],
			},
			gatewayResponse: { id: "resp_1", output_text: "hi" },
			providerRequest: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello" }] },
			providerResponse: { id: "chatcmpl_1" },
			detailMetadata: { replay_supported: true },
			userAgent: "phaseo-typescript/2.2.0",
			clientSource: {
				id: "phaseo-typescript",
				name: "Phaseo TypeScript SDK",
				kind: "sdk",
				version: "2.2.0",
				detection: "declared",
			},
			providerAttempts: [
				{
					attempt_number: 1,
					provider: "openai",
					api_model_id: "openai/gpt-5-nano",
					outcome: "success",
					status: 200,
				},
			],
		});

		expect(gatewayRequestRows).toHaveLength(1);
		expect(gatewayRequestRows[0]).toEqual(
			expect.objectContaining({
				model_id: "phaseo/free",
				provider: "openai",
				provider_attempts: [
					expect.objectContaining({
						api_model_id: "openai/gpt-5-nano",
					}),
				],
				usage_input_tokens: 2,
				usage_output_tokens: 1,
				usage_total_tokens: 3,
				usage_input_quad_tokens: expect.any(Number),
				usage_output_quad_tokens: expect.any(Number),
				usage_total_quad_tokens: expect.any(Number),
				detail_metadata: expect.objectContaining({
					labels: [{ key: "team", value: "support" }],
					replay_supported: true,
					client_source: expect.objectContaining({ id: "phaseo-typescript" }),
					request: expect.objectContaining({ user_agent: "phaseo-typescript/2.2.0" }),
				}),
			}),
		);
		expect(gatewayRequestRows[0].usage_input_quad_tokens).toBeGreaterThan(0);
		expect(gatewayRequestRows[0].usage_output_quad_tokens).toBeGreaterThan(0);
		expect(detailRows).toHaveLength(1);
		expect(detailRows[0]).toEqual(
			expect.objectContaining({
				request_id: "req_success_1",
				workspace_id: "ws_1",
				request_payload: {
					model: "openai/gpt-5-nano",
					messages: [{ role: "user", content: "hello" }],
				},
				request_content: [{ role: "user", content: "hello" }],
				metadata: expect.objectContaining({ replay_supported: true }),
			}),
		);
		expect(consoleErrorSpy).not.toHaveBeenCalledWith(
			"[audit] ensureAppId returned null",
			expect.anything(),
		);
		consoleErrorSpy.mockRestore();
	});

	it("persists only the synthetic identity for a stealth request", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];
		const v2Events: any[] = [];
		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async (_rpc: string, payload: any) => {
				v2Events.push(payload.p_event);
				return { data: "v2_stealth", error: null };
			}),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") return {
					insert: vi.fn((row: any) => {
						gatewayRequestRows.push(row);
						return { select: vi.fn(() => ({ single: vi.fn(async () => ({
							data: { id: "row_stealth", created_at: "2026-08-27T12:00:00.000Z", workspace_id: "ws_stealth" },
							error: null,
						})) })) };
					}),
				};
				if (table === "gateway_request_details") return {
					insert: vi.fn(async (row: any) => {
						detailRows.push(row);
						return { error: null };
					}),
				};
				throw new Error(`unexpected table ${table}`);
			}),
		});

		await auditSuccess({
			requestId: "req_stealth",
			workspaceId: "ws_stealth",
			provider: "openai",
			providerApiModelId: "pam_openai_secret",
			providerModelSlug: "oai-stealth-test-model-internal",
			model: "stealth/test-model-20260827",
			requestedModel: "stealth/test-model-20260827",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			usagePriced: { input_tokens: 1, output_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			currency: "USD",
			statusCode: 200,
			requestPayload: { model: "stealth/test-model-20260827", messages: [] },
			gatewayResponse: { model: "oai-stealth-test-model-internal", output_text: "ok" },
			providerRequest: { model: "oai-stealth-test-model-internal" },
			providerResponse: { provider: "openai", model: "oai-stealth-test-model-internal" },
			providerAttempts: [{
				provider: "openai",
				api_model_id: "pam_openai_secret",
				provider_model_slug: "oai-stealth-test-model-internal",
				upstream_url: "https://api.openai.com/v1/responses",
				outcome: "success",
				status: 200,
			}],
			detailMetadata: {
				routing_snapshot: [{ provider_id: "openai", provider_model_slug: "oai-stealth-test-model-internal" }],
				routing_diagnostics: { selected: { providerId: "openai", apiModelId: "pam_openai_secret" } },
			},
		});

		expect(gatewayRequestRows[0]).toMatchObject({
			model_id: "stealth/test-model-20260827",
			canonical_model_id: "stealth/test-model-20260827",
			provider: "stealth",
			provider_attempts: [{
				provider: "stealth",
				api_model_id: "stealth/test-model-20260827",
				provider_model_slug: "stealth/test-model-20260827",
				upstream_url: null,
			}],
		});
		expect(persistGatewayUpstreamRequestsMock).toHaveBeenCalledWith(expect.objectContaining({
			modelId: "stealth/test-model-20260827",
			provider: "stealth",
			providerApiModelId: "stealth/test-model-20260827",
			providerModelSlug: "stealth/test-model-20260827",
		}));
		expect(v2Events[0]).toMatchObject({
			requested_model_input: "stealth/test-model-20260827",
			routed_model_slug: "stealth/test-model-20260827",
			provider: "stealth",
			provider_model_id: "stealth:stealth/test-model-20260827",
			provider_api_model_id: "stealth/test-model-20260827",
		});
		expect(detailRows[0]).toMatchObject({
			model_id: "stealth/test-model-20260827",
			provider: "stealth",
			provider_request: null,
			provider_response: null,
			gateway_response: { model: "stealth/test-model-20260827", output_text: "ok" },
		});
		expect(JSON.stringify({ gatewayRequestRows, detailRows, v2Events, upstream: persistGatewayUpstreamRequestsMock.mock.calls }))
			.not.toMatch(/openai|pam_openai_secret|oai-stealth-test-model-internal|api\.openai\.com/i);
	});

	it("stores replay-ready details for execute-stage failures", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];

		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_2", error: null })),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn((row: any) => {
							gatewayRequestRows.push(row);
							return {
								select: vi.fn(() => ({
									single: vi.fn(async () => ({
										data: {
											id: "row_2",
											created_at: "2026-05-05T12:05:00.000Z",
											workspace_id: "ws_2",
										},
										error: null,
									})),
								})),
							};
						}),
					};
				}

				if (table === "gateway_request_details") {
					return {
						insert: vi.fn(async (row: any) => {
							detailRows.push(row);
							return { error: null };
						}),
					};
				}

				throw new Error(`unexpected table ${table}`);
			}),
		});

		await auditFailure({
			stage: "execute",
			requestId: "req_failure_1",
			workspaceId: "ws_2",
			endpoint: "responses",
			model: "phaseo/free",
			requestedModel: "phaseo/free",
			provider: "openai",
			stream: false,
			statusCode: 500,
			errorCode: "gateway:upstream_error",
			errorMessage: "provider failed",
			requestPayload: {
				model: "openai/gpt-5.4-nano",
				input: [{ role: "user", content: "retry me" }],
			},
			gatewayResponse: { error: "upstream_error" },
			providerRequest: { model: "openai/gpt-5.4-nano" },
			providerResponse: { error: { message: "bad gateway" } },
			detailMetadata: { replay_supported: true, stage: "execute" },
			providerAttempts: [
				{
					attempt_number: 1,
					provider: "openai",
					api_model_id: "openai/gpt-5.4-nano",
					outcome: "error",
					status: 500,
				},
			],
		});

		expect(gatewayRequestRows).toHaveLength(1);
		expect(gatewayRequestRows[0]).toEqual(
			expect.objectContaining({
				model_id: "phaseo/free",
				provider: "openai",
				provider_attempts: [
					expect.objectContaining({
						api_model_id: "openai/gpt-5.4-nano",
					}),
				],
			}),
		);
		expect(detailRows).toHaveLength(1);
		expect(detailRows[0]).toEqual(
			expect.objectContaining({
				request_id: "req_failure_1",
				workspace_id: "ws_2",
				success: false,
				request_payload: {
					model: "openai/gpt-5.4-nano",
					input: [{ role: "user", content: "retry me" }],
				},
				request_content: [{ role: "user", content: "retry me" }],
				metadata: expect.objectContaining({
					replay_supported: true,
					stage: "execute",
				}),
			}),
		);
	});

	it("persists pre-model failures with an explicit unknown model", async () => {
		const gatewayRequestRows: any[] = [];
		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_unknown", error: null })),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn((row: any) => {
							gatewayRequestRows.push(row);
							return {
								select: vi.fn(() => ({
									single: vi.fn(async () => ({
										data: {
											id: "row_unknown",
											created_at: "2026-08-10T19:34:07.000Z",
											workspace_id: "ws_unknown",
										},
										error: null,
									})),
								})),
							};
						}),
					};
				}
				if (table === "gateway_request_details") {
					return { insert: vi.fn(async () => ({ error: null })) };
				}
				throw new Error(`unexpected table ${table}`);
			}),
		});

		await auditFailure({
			stage: "before",
			requestId: "req_pre_model_failure",
			workspaceId: "ws_unknown",
			endpoint: "responses",
			statusCode: 401,
			errorCode: "user:unauthorised",
			errorMessage: "Unauthorised",
		});

		expect(gatewayRequestRows).toHaveLength(1);
		expect(gatewayRequestRows[0]).toEqual(expect.objectContaining({
			model_id: "unknown",
			canonical_model_id: "unknown",
		}));
	});

	it("keeps rollup sync independent from detail persistence failures", async () => {
		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_3", error: null })),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn(() => ({
							select: vi.fn(() => ({
								single: vi.fn(async () => ({
									data: {
										id: "row_3",
										created_at: "2026-05-05T12:10:00.000Z",
										workspace_id: "ws_3",
									},
									error: null,
								})),
							})),
						})),
					};
				}

				if (table === "gateway_request_details") {
					return {
						insert: vi.fn(async () => ({
							error: { message: "details insert failed" },
						})),
					};
				}

				throw new Error(`unexpected table ${table}`);
			}),
		});

		await expect(
			auditSuccess({
				requestId: "req_success_2",
				workspaceId: "ws_3",
				provider: "openai",
				model: "openai/gpt-5-nano",
				endpoint: "chat.completions",
				stream: false,
				byok: false,
				usagePriced: { prompt_tokens: 2, completion_tokens: 1, pricing: { lines: [] } },
				totalCents: 0.001,
				totalNanos: 1000000,
				currency: "USD",
				statusCode: 200,
				requestPayload: {
					model: "openai/gpt-5-nano",
					messages: [{ role: "user", content: "hello" }],
				},
				gatewayResponse: { id: "resp_2", output_text: "hi" },
				providerRequest: { model: "openai/gpt-5-nano" },
				providerResponse: { id: "chatcmpl_2" },
				detailMetadata: { replay_supported: true },
			}),
		).resolves.toBeUndefined();

		expect(syncWorkspaceUsageRollupForRequestMock).toHaveBeenCalledWith({
			requestRowId: "row_3",
			requestCreatedAt: "2026-05-05T12:10:00.000Z",
			workspaceId: "ws_3",
			context: "audit_success",
		});
	});

	it("keeps payload details out of Supabase and R2 when I/O logging is not explicitly enabled", async () => {
		resolveGatewayIoLoggingPolicyMock.mockResolvedValue({
			featureEnabled: true,
			captureEnabled: false,
			settings: { enabled: false, retentionDays: 90, includeProviderPayloads: true },
		});
		const fromMock = vi.fn((table: string) => {
			if (table !== "gateway_requests") throw new Error(`unexpected table ${table}`);
			return {
				insert: vi.fn(() => ({
					select: vi.fn(() => ({
						single: vi.fn(async () => ({
							data: {
								id: "row_no_io",
								created_at: "2026-05-05T12:12:00.000Z",
								workspace_id: "ws_no_io",
							},
							error: null,
						})),
					})),
				})),
			};
		});
		const rpcMock = vi.fn(async () => ({ data: "request-event-id", error: null }));
		getSupabaseAdminMock.mockReturnValue({ from: fromMock, rpc: rpcMock });

		await auditSuccess({
			requestId: "req_no_io",
			workspaceId: "ws_no_io",
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			usagePriced: {
				input_tokens: 10,
				output_tokens: 4,
				input_tokens_details: { cached_tokens: 3 },
				output_tool_call_count: 1,
				pricing: { lines: [] },
			},
			totalCents: 0.001,
			currency: "USD",
			statusCode: 200,
			requestPayload: {
				messages: [{ role: "user", content: "private prompt" }],
				response_format: { type: "json_object" },
				service_tier: "fast",
			},
			gatewayResponse: {
				output_text: '{"result":"private response"}',
				usage: { service_tier: "priority" },
			},
			providerRequest: { secret: "provider request" },
			providerResponse: { secret: "provider response" },
			providerAttempts: [{
				attempt_number: 1,
				provider: "openai",
				api_model_id: "gpt-5-nano",
				outcome: "success",
				duration_ms: 25,
				status: 200,
			}],
			detailMetadata: {
				routing_snapshot: [{
					rank: 1,
					provider: "openai",
					provider_id: "openai",
					provider_api_model_id: "gpt-5-nano",
					score: 0.82,
					breaker: "closed",
					score_factor_values: [0.99, 0.8, 0.7, 0.6, 1, 0.95, 50, 0.5, 1, 1, 1, 1, 1, 1],
					score_trace: { calculation: { baseScore: 0.82, finalScore: 0.82 } },
				}],
				routing_diagnostics: {
					algorithm: {
						version: "provider-score-v2",
						seed: 123,
						selectionMethod: "score_sort",
						poolBounds: { latencyP50MinMs: 100, latencyP50MaxMs: 200 },
					},
					routingMode: "balanced",
					workspacePolicy: {
						droppedProviders: [{
							providerId: "blocked-provider",
							apiModelId: "blocked-model",
							providerModelSlug: "blocked-route",
							reason: "provider_in_blocklist",
						}],
					},
					filterStages: [{
						stage: "hints.ignore",
						droppedProviders: [{
							providerId: "ignored-provider",
							reason: "listed_in_provider.ignore",
						}],
					}],
				},
			},
		});

		expect(fromMock).toHaveBeenCalledTimes(1);
		expect(fromMock).toHaveBeenCalledWith("gateway_requests");
		expect(persistGatewayUpstreamRequestsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "req_no_io",
				provider: "openai",
			}),
		);
		expect(rpcMock).toHaveBeenCalledOnce();
		expect(rpcMock.mock.calls[0]?.[0]).toBe("ingest_v2_gateway_request_with_routing");
		const event = rpcMock.mock.calls[0]?.[1]?.p_event;
		expect(event).toEqual(expect.objectContaining({
			request_id: "req_no_io",
			workspace_id: "ws_no_io",
			requested_model_input: "openai/gpt-5-nano",
			cost_nanos: 10_000,
			usage_meters: expect.any(Array),
			tool_call_count: 1,
			tool_call_succeeded: true,
			structured_output_attempted: true,
			structured_output_succeeded: true,
			service_tier_requested: "priority",
			service_tier_observed: "priority",
			service_tier: "priority",
		}));
		expect(event.usage_meters).toEqual(expect.arrayContaining([
			expect.objectContaining({ meter_key: "input_tokens", quantity: 10 }),
			expect.objectContaining({ meter_key: "cached_input_tokens", quantity: 3 }),
			expect.objectContaining({ meter_key: "output_tokens", quantity: 4 }),
		]));
		expect(event.safe_metadata).toEqual(expect.objectContaining({
			cached_input_tokens_are_subset_of_input: true,
			service_tier: "priority",
		}));
		expect(event.routing_decisions).toEqual([
			expect.objectContaining({
				decision: "ranked",
				provider: "openai",
				rank: 1,
				score: 0.82,
				selected: true,
				attempted: true,
				score_factors: expect.objectContaining({
					price_score: 1,
					success_rate: 0.99,
				}),
				score_trace: expect.objectContaining({
					calculation: expect.objectContaining({ finalScore: 0.82 }),
				}),
			}),
			expect.objectContaining({
				decision: "excluded",
				provider: "ignored-provider",
				exclusion_stage: "hints.ignore",
				exclusion_reason: "listed_in_provider.ignore",
			}),
			expect.objectContaining({
				decision: "excluded",
				provider: "blocked-provider",
				provider_api_model_id: "blocked-model",
				exclusion_stage: "workspace_policy",
				exclusion_reason: "provider_in_blocklist",
			}),
		]);
		expect(event.routing_trace).toEqual(expect.objectContaining({
			algorithm: expect.objectContaining({ version: "provider-score-v2", seed: 123 }),
			routing_mode: "balanced",
		}));
		expect(JSON.stringify(event)).not.toContain("private prompt");
		expect(JSON.stringify(event)).not.toContain("private response");
		expect(persistGatewayIoLogMock).not.toHaveBeenCalled();
	});

	it("falls back to atomic V2 ingestion while the routing RPC is not yet available", async () => {
		resolveGatewayIoLoggingPolicyMock.mockResolvedValue({
			featureEnabled: true,
			captureEnabled: false,
			settings: { enabled: false, retentionDays: 90, includeProviderPayloads: true },
		});
		const fromMock = vi.fn(() => ({
			insert: vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(async () => ({
						data: {
							id: "row_rpc_fallback",
							created_at: "2026-05-05T12:13:00.000Z",
							workspace_id: "ws_rpc_fallback",
						},
						error: null,
					})),
				})),
			})),
		}));
		const rpcMock = vi.fn(async (rpc: string) => rpc === "ingest_v2_gateway_request_with_routing"
			? {
				data: null,
				error: {
					code: "PGRST202",
					message: "Could not find the function public.ingest_v2_gateway_request_with_routing(p_event)",
				},
			}
			: { data: "request-event-id", error: null });
		getSupabaseAdminMock.mockReturnValue({ from: fromMock, rpc: rpcMock });

		await auditSuccess({
			requestId: "req_rpc_fallback",
			workspaceId: "ws_rpc_fallback",
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "chat.completions",
			stream: true,
			byok: false,
			usagePriced: { input_tokens: 2, output_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			currency: "USD",
			statusCode: 200,
		});

		expect(rpcMock).toHaveBeenCalledTimes(2);
		expect(rpcMock.mock.calls[0]?.[0]).toBe("ingest_v2_gateway_request_with_routing");
		expect(rpcMock.mock.calls[1]?.[0]).toBe("ingest_v2_gateway_request");
		expect(rpcMock.mock.calls[1]?.[1]?.p_event).not.toHaveProperty("routing_decisions");
		expect(rpcMock.mock.calls[1]?.[1]?.p_event).toEqual(expect.objectContaining({
			request_id: "req_rpc_fallback",
			workspace_id: "ws_rpc_fallback",
			usage_meters: expect.any(Array),
		}));
	});

	it("disables request detail persistence in local testing mode when the detail table is missing", async () => {
		isLocalTestingModeEnabledMock.mockReturnValue(true);
		const detailInsertMock = vi
			.fn()
			.mockResolvedValueOnce({
				error: {
					code: "PGRST205",
					message:
						"Could not find the table 'public.gateway_request_details' in the schema cache",
				},
			})
			.mockResolvedValue({ error: null });

		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_4", error: null })),
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn(() => ({
							select: vi.fn(() => ({
								single: vi.fn(async () => ({
									data: {
										id: "row_4",
										created_at: "2026-05-05T12:15:00.000Z",
										workspace_id: "ws_4",
									},
									error: null,
								})),
							})),
						})),
					};
				}

				if (table === "gateway_request_details") {
					return {
						insert: detailInsertMock,
					};
				}

				throw new Error(`unexpected table ${table}`);
			}),
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await auditSuccess({
			requestId: "req_success_local_missing_details_1",
			workspaceId: "ws_4",
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			usagePriced: { prompt_tokens: 2, completion_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			totalNanos: 1000000,
			currency: "USD",
			statusCode: 200,
			requestPayload: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello" }] },
			gatewayResponse: { id: "resp_3", output_text: "hi" },
			providerRequest: { model: "openai/gpt-5-nano" },
			providerResponse: { id: "chatcmpl_3" },
		});

		await auditSuccess({
			requestId: "req_success_local_missing_details_2",
			workspaceId: "ws_4",
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "chat.completions",
			stream: false,
			byok: false,
			usagePriced: { prompt_tokens: 2, completion_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			totalNanos: 1000000,
			currency: "USD",
			statusCode: 200,
			requestPayload: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello again" }] },
			gatewayResponse: { id: "resp_4", output_text: "hi again" },
			providerRequest: { model: "openai/gpt-5-nano" },
			providerResponse: { id: "chatcmpl_4" },
		});

		expect(detailInsertMock).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(
			"[audit] gateway_request_details not available in local testing mode; skipping request detail persistence."
		);

		warnSpy.mockRestore();
	});

	it("combines legacy column fallbacks before retrying the audit insert", async () => {
		const attemptedRows: any[] = [];
		resolveGatewayIoLoggingPolicyMock.mockResolvedValue({
			featureEnabled: true,
			captureEnabled: false,
			settings: { enabled: false, retentionDays: 90, includeProviderPayloads: false },
		});

		getSupabaseAdminMock.mockReturnValue({
			rpc: vi.fn(async () => ({ data: "v2_request_event_legacy", error: null })),
			from: vi.fn((table: string) => {
				if (table !== "gateway_requests") throw new Error(`unexpected table ${table}`);
				return {
					insert: vi.fn((row: any) => ({
						select: vi.fn(() => ({
							single: vi.fn(async () => {
								attemptedRows.push(row);
								const errors = [
									{ code: "PGRST204", message: "Could not find provider_ttft_ms on gateway_requests" },
									{ code: "PGRST204", message: "Could not find usage_total_tokens on gateway_requests" },
									{ code: "PGRST204", message: "Could not find error_payload on gateway_requests" },
								];
								const error = errors[attemptedRows.length - 1] ?? null;
								return {
									data: error
										? null
										: {
											id: "row_legacy",
											created_at: "2026-08-05T10:00:00.000Z",
											workspace_id: "ws_legacy",
										},
									error,
								};
							}),
						})),
					})),
				};
			}),
		});

		await auditSuccess({
			requestId: "req_legacy_columns",
			workspaceId: "ws_legacy",
			provider: "openai",
			model: "openai/gpt-5-nano",
			endpoint: "chat.completions",
			stream: true,
			byok: false,
			usagePriced: { prompt_tokens: 2, completion_tokens: 1, pricing: { lines: [] } },
			totalCents: 0.001,
			totalNanos: 1_000_000,
			currency: "USD",
			statusCode: 200,
			providerTtftMs: 120,
			gatewayTtftMs: 140,
			outputSpeedTps: 30,
			tpotMs: 33,
			itlMs: 33,
			phaseoOverheadMs: 20,
		});

		expect(attemptedRows).toHaveLength(4);
		expect(attemptedRows[0]).toEqual(expect.objectContaining({
			provider_ttft_ms: 120,
			usage_total_tokens: 3,
			error_payload: null,
		}));
		expect(attemptedRows[1]).not.toHaveProperty("provider_ttft_ms");
		expect(attemptedRows[1]).toHaveProperty("usage_total_tokens", 3);
		expect(attemptedRows[2]).not.toHaveProperty("provider_ttft_ms");
		expect(attemptedRows[2]).not.toHaveProperty("usage_total_tokens");
		expect(attemptedRows[2]).toHaveProperty("error_payload", null);
		expect(attemptedRows[3]).not.toHaveProperty("provider_ttft_ms");
		expect(attemptedRows[3]).not.toHaveProperty("usage_total_tokens");
		expect(attemptedRows[3]).not.toHaveProperty("error_payload");
	});
});
