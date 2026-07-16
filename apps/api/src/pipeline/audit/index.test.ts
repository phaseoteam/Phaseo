import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn();
const isLocalTestingModeEnabledMock = vi.fn();
const ensureAppIdMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();

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
	persistGatewayIoLog: vi.fn(async () => ({ io_log_status: "not_enabled" })),
}));

import { auditFailure, auditSuccess } from "./index";

describe("audit request detail persistence", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReset();
		isLocalTestingModeEnabledMock.mockReset();
		ensureAppIdMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReturnValue(() => {});
		isLocalTestingModeEnabledMock.mockReturnValue(false);
		ensureAppIdMock.mockResolvedValue("app_resolved");
		syncWorkspaceUsageRollupForRequestMock.mockResolvedValue(undefined);
	});

	it("stores replay-ready details for successful requests", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];
		const upstreamRows: any[] = [];

		getSupabaseAdminMock.mockReturnValue({
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

				if (table === "gateway_upstream_requests") {
					return {
						insert: vi.fn(async (rows: any[]) => {
							upstreamRows.push(...rows);
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
			totalCents: 3.7,
			totalNanos: 37_000_000,
			currency: "USD",
			statusCode: 200,
			requestPayload: {
				model: "openai/gpt-5-nano",
				messages: [{ role: "user", content: "hello" }],
			},
			gatewayResponse: { id: "resp_1", output_text: "hi" },
			providerRequest: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello" }] },
			providerResponse: { id: "chatcmpl_1" },
			detailMetadata: {
				replay_supported: true,
				upstream_exchanges: [
					{
						sequence: 1,
						round_number: 1,
						attempt_number: 1,
						stage: "upstream",
						provider: "moonshot-ai",
						model: "phaseo/free",
						status: 429,
						outcome: "upstream_non_2xx",
						error: { type: "rate_limit", message: "rate limited" },
					},
					{
						sequence: 2,
						round_number: 1,
						attempt_number: 2,
						stage: "upstream",
						provider: "wafer",
						model: "phaseo/free",
						status: 200,
						outcome: "success",
						finish_reason: "tool_calls",
						usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
					},
					{
						sequence: 3,
						round_number: 2,
						attempt_number: 1,
						stage: "upstream",
						provider: "wafer",
						model: "phaseo/free",
						status: 200,
						outcome: "success",
						finish_reason: "stop",
						usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
					},
				],
			},
			providerAttempts: [
				{
					attempt_number: 1,
					provider: "openai",
					api_model_id: "openai/gpt-5-nano",
					outcome: "success",
					status: 200,
					upstream_request: { model: "openai/gpt-5-nano" },
					upstream_response: { id: "chatcmpl_1" },
				},
			],
		});

		expect(gatewayRequestRows).toHaveLength(1);
		expect(gatewayRequestRows[0]).toEqual(
			expect.objectContaining({
				model_id: "phaseo/free",
				provider: "openai",
				provider_attempts: [],
				usage_input_tokens: 2,
				usage_output_tokens: 1,
				usage_total_tokens: 3,
				usage_input_quad_tokens: expect.any(Number),
				usage_output_quad_tokens: expect.any(Number),
				usage_total_quad_tokens: expect.any(Number),
				detail_metadata: expect.objectContaining({
					upstream_exchange_count: 3,
				}),
			}),
		);
		expect(gatewayRequestRows[0].detail_metadata).not.toHaveProperty("upstream_exchanges");
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
				metadata: expect.objectContaining({
					replay_supported: true,
					upstream_exchange_count: 3,
				}),
			}),
		);
		expect(upstreamRows).toHaveLength(3);
		expect(upstreamRows[0]).toEqual(expect.objectContaining({
			gateway_request_id: "row_1",
			gateway_request_created_at: "2026-05-05T12:00:00.000Z",
			created_at: "2026-05-05T12:00:00.000Z",
			request_id: "req_success_1",
			workspace_id: "ws_1",
			sequence: 1,
			provider: "moonshot-ai",
			status_code: 429,
			success: false,
			cost_nanos: 0,
		}));
		expect(upstreamRows.slice(1).map((row) => ({
			provider: row.provider,
			finishReason: row.finish_reason,
			costNanos: row.cost_nanos,
		}))).toEqual([
			{ provider: "wafer", finishReason: "tool_calls", costNanos: 12_000_000 },
			{ provider: "wafer", finishReason: "stop", costNanos: 25_000_000 },
		]);
	});

	it("stores replay-ready details for execute-stage failures", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];
		const upstreamRows: any[] = [];

		getSupabaseAdminMock.mockReturnValue({
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

				if (table === "gateway_upstream_requests") {
					return {
						insert: vi.fn(async (rows: any[]) => {
							upstreamRows.push(...rows);
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
			detailMetadata: {
				replay_supported: true,
				stage: "execute",
				upstream_exchanges: [
					{ sequence: 1, provider: "moonshot-ai", model: "phaseo/free", status: 429, outcome: "upstream_non_2xx" },
					{ sequence: 2, provider: "openai", model: "phaseo/free", status: 500, outcome: "upstream_non_2xx" },
				],
			},
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
				provider_attempts: [],
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
		expect(upstreamRows).toHaveLength(2);
		expect(upstreamRows.map((row) => ({
			provider: row.provider,
			status: row.status_code,
			success: row.success,
			cost: row.cost_nanos,
		}))).toEqual([
			{ provider: "moonshot-ai", status: 429, success: false, cost: 0 },
			{ provider: "openai", status: 500, success: false, cost: 0 },
		]);
	});

	it("keeps rollup sync independent from detail persistence failures", async () => {
		getSupabaseAdminMock.mockReturnValue({
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
