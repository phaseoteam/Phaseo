import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn();
const isLocalTestingModeEnabledMock = vi.fn();
const ensureAppIdMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();
const resolveGatewayIoLoggingPolicyMock = vi.fn();
const persistGatewayIoLogMock = vi.fn();

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

import { auditFailure, auditSuccess } from "./index";

describe("audit request detail persistence", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReset();
		isLocalTestingModeEnabledMock.mockReset();
		ensureAppIdMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();
		resolveGatewayIoLoggingPolicyMock.mockReset();
		persistGatewayIoLogMock.mockReset();
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
			},
			gatewayResponse: { output_text: '{"result":"private response"}' },
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
					score_factor_values: [0.99, 0.8, 0.7, 0.6, 1, 0.95, 50, 0.5, 0, 1, 1, 1, 1, 1, 1],
				}],
				routing_diagnostics: {
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
		}));
		expect(event.usage_meters).toEqual(expect.arrayContaining([
			expect.objectContaining({ meter_key: "input_tokens", quantity: 10 }),
			expect.objectContaining({ meter_key: "cached_input_tokens", quantity: 3 }),
			expect.objectContaining({ meter_key: "output_tokens", quantity: 4 }),
		]));
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
			}),
			expect.objectContaining({
				decision: "excluded",
				provider: "ignored-provider",
				exclusion_stage: "hints.ignore",
				exclusion_reason: "listed_in_provider.ignore",
			}),
		]);
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
});
