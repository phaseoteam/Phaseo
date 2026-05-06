import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdminMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn();
const ensureAppIdMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: any[]) => getSupabaseAdminMock(...args),
	ensureRuntimeForBackground: (...args: any[]) => ensureRuntimeForBackgroundMock(...args),
}));

vi.mock("../after/apps", () => ({
	ensureAppId: (...args: any[]) => ensureAppIdMock(...args),
}));

vi.mock("@core/workspace-usage-rollups", () => ({
	syncWorkspaceUsageRollupForRequest: (...args: any[]) =>
		syncWorkspaceUsageRollupForRequestMock(...args),
}));

import { auditFailure, auditSuccess } from "./index";

describe("audit request detail persistence", () => {
	beforeEach(() => {
		getSupabaseAdminMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReset();
		ensureAppIdMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();
		ensureRuntimeForBackgroundMock.mockReturnValue(() => {});
		ensureAppIdMock.mockResolvedValue("app_resolved");
		syncWorkspaceUsageRollupForRequestMock.mockResolvedValue(undefined);
	});

	it("stores replay-ready details for successful requests", async () => {
		const gatewayRequestRows: any[] = [];
		const detailRows: any[] = [];

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

				throw new Error(`unexpected table ${table}`);
			}),
		});

		await auditSuccess({
			requestId: "req_success_1",
			workspaceId: "ws_1",
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
			gatewayResponse: { id: "resp_1", output_text: "hi" },
			providerRequest: { model: "openai/gpt-5-nano", messages: [{ role: "user", content: "hello" }] },
			providerResponse: { id: "chatcmpl_1" },
			detailMetadata: { replay_supported: true },
		});

		expect(gatewayRequestRows).toHaveLength(1);
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
				metadata: { replay_supported: true },
			}),
		);
	});

	it("stores replay-ready details for execute-stage failures", async () => {
		const detailRows: any[] = [];

		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table === "gateway_requests") {
					return {
						insert: vi.fn(() => ({
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
						})),
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
			model: "openai/gpt-5.4-nano",
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
		});

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
				metadata: { replay_supported: true, stage: "execute" },
			}),
		);
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
});
