import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	record: null as any,
	alreadyBilled: false,
	statusCalls: [] as Array<{
		workspaceId: string;
		batchId: string;
		status: string;
		metaPatch: Record<string, unknown>;
	}>,
	chargeCalls: [] as Array<{
		requestId: string;
		workspaceId: string;
		cost_nanos: number;
	}>,
	markCalls: [] as Array<{
		workspaceId: string;
		batchId: string;
	}>,
	loadCalls: [] as Array<{
		provider: string;
		model: string;
		endpoint: string;
	}>,
	fetchCalls: [] as string[],
}));

function resetState() {
	state.record = null;
	state.alreadyBilled = false;
	state.statusCalls = [];
	state.chargeCalls = [];
	state.markCalls = [];
	state.loadCalls = [];
	state.fetchCalls = [];
}

vi.mock("@core/batch-jobs", () => ({
	getBatchJobRecord: vi.fn(async () => state.record),
	isBatchJobBilled: vi.fn(async () => state.alreadyBilled),
	markBatchJobBilled: vi.fn(async (workspaceId: string, batchId: string) => {
		state.markCalls.push({ workspaceId, batchId });
		return true;
	}),
	setBatchJobStatus: vi.fn(async (workspaceId: string, batchId: string, status: string, metaPatch: Record<string, unknown>) => {
		state.statusCalls.push({ workspaceId, batchId, status, metaPatch });
	}),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://api.openai.example/v1",
	}),
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: vi.fn(() => ({ key: "test-openai-key" })),
}));

vi.mock("@pipeline/pricing/persist", () => ({
	recordUsageAndCharge: vi.fn(async (args: { requestId: string; workspaceId: string; cost_nanos: number }) => {
		state.chargeCalls.push(args);
	}),
}));

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: vi.fn(async (provider: string, model: string, endpoint: string) => {
		state.loadCalls.push({ provider, model, endpoint });
		if (endpoint !== "text.generate") return null;
		return {
			provider,
			model,
			endpoint,
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: "test",
			rules: [
				{
					id: "input",
					pricing_plan: "batch",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1,
					price_per_unit: "0.1",
					currency: "USD",
					match: [],
					priority: 100,
				},
				{
					id: "output",
					pricing_plan: "batch",
					meter: "output_text_tokens",
					unit: "token",
					unit_size: 1,
					price_per_unit: "0.2",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};
	}),
}));

describe("batch-finalization", () => {
	beforeEach(() => {
		resetState();
		vi.unstubAllGlobals();
	});

	it("charges completed partial-success batches from output JSONL and marks them billed", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_partial_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_123",
				requestCounts: {
					total: 3,
					completed: 2,
					failed: 1,
				},
			},
		};

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				state.fetchCalls.push(String(input));
				return new Response(
					[
						JSON.stringify({
							response: {
								status_code: 200,
								body: {
									model: "openai/gpt-4o-mini",
									usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
								},
							},
						}),
						JSON.stringify({
							response: {
								status_code: 200,
								body: {
									model: "openai/gpt-4o-mini",
									usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
								},
							},
						}),
					].join("\n"),
					{ status: 200, headers: { "Content-Type": "application/jsonl" } },
				);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_partial_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged_partial_success",
		});
		expect(state.fetchCalls).toEqual(["https://api.openai.example/v1/files/file_out_123/content"]);
		expect(state.loadCalls.map((call) => call.endpoint)).toEqual(["text.generate", "text.generate"]);
		expect(state.chargeCalls).toEqual([
			{
				requestId: "batch_capture:batch_partial_123",
				workspaceId: "ws_batch_test",
				cost_nanos: 800000000,
			},
		]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_partial_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			workspaceId: "ws_batch_test",
			batchId: "batch_partial_123",
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 800000000,
				billingReason: "charged_partial_success",
			},
		});
		expect((state.statusCalls.at(-1)?.metaPatch.pricingBreakdown as any)?.failed_requests).toBe(1);
	});

	it("marks terminal failed batches billed with zero cost when no requests completed", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_failed_123",
			status: "failed",
			meta: {
				provider: "openai",
				status: "failed",
				endpoint: "/v1/responses",
				requestCounts: {
					total: 2,
					completed: 0,
					failed: 2,
				},
			},
		};

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_failed_123",
			status: "failed",
		});

		expect(result).toEqual({
			status: "failed",
			charged: false,
			billed: true,
			reason: "failed",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_failed_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "failed",
			metaPatch: {
				charged: false,
				costNanos: 0,
				billingReason: "failed",
			},
		});
	});

	it("leaves batches unbilled when successful output rows are missing usage", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_missing_usage_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_missing_usage",
				requestCounts: {
					total: 1,
					completed: 1,
					failed: 0,
				},
			},
		};

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				state.fetchCalls.push(String(input));
				return new Response(
					JSON.stringify({
						response: {
							status_code: 200,
							body: {
								model: "openai/gpt-4o-mini",
							},
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/jsonl" } },
				);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_missing_usage_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			billed: false,
			reason: "missing_usage",
		});
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: false,
				billingReason: "missing_usage",
			},
		});
	});
});
