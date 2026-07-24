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
	requestRows: [] as Array<Record<string, unknown>>,
	fetchCalls: [] as string[],
	walletCalls: [] as Array<Record<string, unknown>>,
	keyUsageCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	captureResult: null as Record<string, unknown> | null,
	releaseError: null as Error | null,
}));

function resetState() {
	state.record = null;
	state.alreadyBilled = false;
	state.statusCalls = [];
	state.chargeCalls = [];
	state.markCalls = [];
	state.loadCalls = [];
	state.requestRows = [];
	state.fetchCalls = [];
	state.walletCalls = [];
	state.keyUsageCalls = [];
	state.captureResult = null;
	state.releaseError = null;
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
	getSupabaseAdmin: () => ({
		rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
			state.keyUsageCalls.push({ name, args });
			return { data: 1, error: null };
		}),
	}),
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: vi.fn(() => ({ key: "test-openai-key" })),
}));

vi.mock("@core/kv", () => ({
	setKeyVersion: vi.fn(async () => Date.now()),
}));

vi.mock("@pipeline/pricing/persist", () => ({
	recordUsageAndCharge: vi.fn(async (args: { requestId: string; workspaceId: string; cost_nanos: number }) => {
		state.chargeCalls.push(args);
	}),
}));

vi.mock("@core/batch-requests", () => ({
	saveBatchRequestRows: vi.fn(async (args: { rows: Array<Record<string, unknown>> }) => {
		state.requestRows.push(...args.rows);
	}),
}));

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: vi.fn(async (provider: string, model: string, endpoint: string) => {
		state.loadCalls.push({ provider, model, endpoint });
		if (endpoint === "text.embed") {
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
						id: "embedding-input",
						pricing_plan: "batch",
						meter: "input_text_tokens",
						unit: "token",
						unit_size: 1,
						price_per_unit: "0.05",
						currency: "USD",
						match: [],
						priority: 100,
					},
				],
			};
		}
		if (endpoint === "video.generate") {
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
						id: "video-seconds",
						pricing_plan: "batch",
						meter: "output_video_seconds",
						unit: "second",
						unit_size: 1,
						price_per_unit: "0.05",
						currency: "USD",
						match: [
							{ path: "video_params.resolution", op: "eq", value: "1280x720" },
						],
						priority: 100,
					},
				],
			};
		}
		if (endpoint === "text.moderate") {
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
						id: "moderation-free",
						pricing_plan: "free",
						meter: "requests",
						unit: "request",
						unit_size: 1,
						price_per_unit: "0",
						currency: "USD",
						match: [],
						priority: 100,
					},
				],
			};
		}
		if (endpoint === "image.generate") {
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
						id: "image-output",
						pricing_plan: "standard",
						meter: "output_image",
						unit: "image",
						unit_size: 1,
						price_per_unit: "0.5",
						currency: "USD",
						match: [
							{ path: "image_params.resolution", op: "eq", value: "1024x1024" },
							{ path: "image_params.quality", op: "eq", value: "high" },
						],
						priority: 100,
					},
				],
			};
		}
		if (endpoint !== "text.generate") return null;
		if (provider === "spacex-ai" && !model.startsWith("spacex-ai/")) return null;
		if (provider === "x-ai") return null;
		if (/-\d{4}-\d{2}-\d{2}$/u.test(model)) return null;
		if (provider === "anthropic" && model === "anthropic/claude-haiku-4-5-20251001") return null;
		if (provider === "anthropic" && model === "anthropic/claude-sonnet-4-6") return null;
		if (!model.includes("/")) return null;
		const rateByModel: Record<string, { input: string; output: string }> = {
			"openai/gpt-4.1-mini": { input: "0.3", output: "0.7" },
			"anthropic/claude-sonnet-4.6": { input: "0.5", output: "1.0" },
		};
		const rates = rateByModel[model] ?? { input: "0.1", output: "0.2" };
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
					price_per_unit: rates.input,
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
					price_per_unit: rates.output,
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		};
	}),
}));

vi.mock("@core/wallet-reservations", () => ({
	captureWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.walletCalls.push({ op: "capture", ...args });
		if (state.captureResult) return state.captureResult;
		return {
			status: "not_found",
			applied: false,
			alreadyApplied: false,
			amountNanos: 0,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
	settleWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.walletCalls.push({ op: "settle", ...args });
		if (state.captureResult) return state.captureResult;
		return {
			status: "captured",
			applied: true,
			alreadyApplied: false,
			amountNanos: args.actualNanos,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
	releaseWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.walletCalls.push({ op: "release", ...args });
		if (state.releaseError) throw state.releaseError;
		return {
			status: "released",
			applied: true,
			alreadyApplied: false,
			amountNanos: 500_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
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
		expect(state.requestRows).toHaveLength(2);
		expect(state.requestRows[0]).toMatchObject({
			provider: "openai",
			nativeBatchId: "batch_partial_123",
			customId: "response-1",
			requestIndex: 0,
			status: "completed",
			responseStatus: 200,
			costNanos: 400000000,
			costUsd: 0.4,
			meta: { finalized_from_output_file: true },
		});
		expect(state.chargeCalls).toEqual([
			{
				requestId: "batch_capture:batch_partial_123",
				workspaceId: "ws_batch_test",
				cost_nanos: 800000000,
			},
		]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_partial_123" }]);
		expect(state.walletCalls).toEqual([]);
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
		expect((state.statusCalls.at(-1)?.metaPatch.pricedUsage as any)?.pricing?.lines).toMatchObject([
			{ dimension: "input_text_tokens", quantity: 4, line_nanos: 400000000 },
			{ dimension: "output_text_tokens", quantity: 2, line_nanos: 400000000 },
		]);
	});

	it("prices OpenAI batch rows when OpenAI returns a dated native model id", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_gpt54_nano_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_gpt54_nano",
				requestCounts: {
					total: 2,
					completed: 2,
					failed: 0,
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
							custom_id: "request-1",
							response: {
								status_code: 200,
								body: {
									model: "gpt-5.4-nano-2026-03-17",
									usage: { input_tokens: 20, output_tokens: 13, total_tokens: 33 },
								},
							},
						}),
						JSON.stringify({
							custom_id: "request-2",
							response: {
								status_code: 200,
								body: {
									model: "gpt-5.4-nano-2026-03-17",
									usage: { input_tokens: 20, output_tokens: 13, total_tokens: 33 },
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
			batchId: "batch_gpt54_nano_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "openai",
			model: "openai/gpt-5.4-nano",
			endpoint: "text.generate",
		});
		expect(state.chargeCalls).toEqual([
			{
				requestId: "batch_capture:batch_gpt54_nano_123",
				workspaceId: "ws_batch_test",
				cost_nanos: 9200000000,
			},
		]);
		expect(state.requestRows).toHaveLength(2);
		expect(state.requestRows.map((row) => row.usage)).toEqual([
			{ input_tokens: 20, output_tokens: 13, total_tokens: 33 },
			{ input_tokens: 20, output_tokens: 13, total_tokens: 33 },
		]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			metaPatch: {
				charged: true,
				costNanos: 9200000000,
				billingReason: "charged",
				pricedUsage: {
					requests: 2,
					input_tokens: 40,
					output_tokens: 26,
					total_tokens: 66,
				},
				pricingBreakdown: {
					total_nanos: 9200000000,
					completed_requests: 2,
					failed_requests: 0,
					total_requests: 2,
				},
			},
		});
		expect((state.statusCalls.at(-1)?.metaPatch.pricedUsage as any)?.pricing?.lines).toMatchObject([
			{ dimension: "input_text_tokens", quantity: 40, line_nanos: 4000000000 },
			{ dimension: "output_text_tokens", quantity: 26, line_nanos: 5200000000 },
		]);
		expect(state.requestRows.map((row) => row.costNanos)).toEqual([4600000000, 4600000000]);
	});

	it("prices OpenAI mixed-model batch rows from each response model", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_openai_mixed_models",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_openai_mixed",
				requestCounts: {
					total: 2,
					completed: 2,
					failed: 0,
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
							custom_id: "mini",
							response: {
								status_code: 200,
								body: {
									model: "openai/gpt-4o-mini",
									usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
								},
							},
						}),
						JSON.stringify({
							custom_id: "four-one-mini",
							response: {
								status_code: 200,
								body: {
									model: "gpt-4.1-mini-2025-04-14",
									usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
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
			batchId: "batch_openai_mixed_models",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "openai",
			model: "openai/gpt-4o-mini",
			endpoint: "text.generate",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "openai",
			model: "openai/gpt-4.1-mini",
			endpoint: "text.generate",
		});
		expect(state.chargeCalls).toEqual([{
			requestId: "batch_capture:batch_openai_mixed_models",
			workspaceId: "ws_batch_test",
			cost_nanos: 5000000000,
		}]);
		expect(state.requestRows.map((row) => row.costNanos)).toEqual([700000000, 4300000000]);
		expect(state.requestRows.map((row) => row.model)).toEqual(["openai/gpt-4o-mini", "gpt-4.1-mini-2025-04-14"]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			metaPatch: {
				charged: true,
				costNanos: 5000000000,
				pricedUsage: {
					requests: 2,
					input_tokens: 8,
					output_tokens: 6,
					total_tokens: 14,
				},
				pricingBreakdown: {
					total_nanos: 5000000000,
					completed_requests: 2,
					failed_requests: 0,
					total_requests: 2,
				},
			},
		});
		expect((state.statusCalls.at(-1)?.metaPatch.pricedUsage as any)?.pricing?.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dimension: "input_text_tokens", quantity: 3, line_nanos: 300000000 }),
				expect.objectContaining({ dimension: "output_text_tokens", quantity: 2, line_nanos: 400000000 }),
				expect.objectContaining({ dimension: "input_text_tokens", quantity: 5, line_nanos: 1500000000 }),
				expect.objectContaining({ dimension: "output_text_tokens", quantity: 4, line_nanos: 2800000000 }),
			]),
		);
	});

	it("prices Anthropic native batch results through the public model alias", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "msgbatch_haiku_45",
			status: "completed",
			meta: {
				provider: "anthropic",
				status: "completed",
				nativeBatchId: "msgbatch_haiku_45",
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
						custom_id: "request-1",
						result: {
							type: "succeeded",
							message: {
								model: "claude-haiku-4-5-20251001",
								usage: { input_tokens: 10, output_tokens: 2 },
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
			batchId: "msgbatch_haiku_45",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "anthropic",
			model: "anthropic/claude-haiku-4.5",
			endpoint: "text.generate",
		});
		expect(state.chargeCalls).toEqual([{
			requestId: "batch_capture:msgbatch_haiku_45",
			workspaceId: "ws_batch_test",
			cost_nanos: 1400000000,
		}]);
		expect(state.requestRows).toHaveLength(1);
		expect(state.requestRows[0]).toMatchObject({
			customId: "request-1",
			provider: "anthropic",
			model: "claude-haiku-4-5-20251001",
			status: "completed",
			responseStatus: 200,
			usage: { input_tokens: 10, output_tokens: 2 },
			costNanos: 1400000000,
		});
	});

	it("prices Anthropic mixed-model batch rows from each native result model", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "msgbatch_anthropic_mixed_models",
			status: "completed",
			meta: {
				provider: "anthropic",
				status: "completed",
				nativeBatchId: "msgbatch_anthropic_mixed_models",
				requestCounts: {
					total: 2,
					completed: 2,
					failed: 0,
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
							custom_id: "haiku",
							result: {
								type: "succeeded",
								message: {
									model: "claude-haiku-4-5-20251001",
									usage: { input_tokens: 10, output_tokens: 2 },
								},
							},
						}),
						JSON.stringify({
							custom_id: "sonnet",
							result: {
								type: "succeeded",
								message: {
									model: "claude-sonnet-4-6",
									usage: { input_tokens: 4, output_tokens: 3 },
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
			batchId: "msgbatch_anthropic_mixed_models",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "anthropic",
			model: "anthropic/claude-haiku-4.5",
			endpoint: "text.generate",
		});
		expect(state.loadCalls).toContainEqual({
			provider: "anthropic",
			model: "anthropic/claude-sonnet-4.6",
			endpoint: "text.generate",
		});
		expect(state.chargeCalls).toEqual([{
			requestId: "batch_capture:msgbatch_anthropic_mixed_models",
			workspaceId: "ws_batch_test",
			cost_nanos: 6400000000,
		}]);
		expect(state.requestRows.map((row) => row.costNanos)).toEqual([1400000000, 5000000000]);
		expect(state.requestRows.map((row) => row.model)).toEqual(["claude-haiku-4-5-20251001", "claude-sonnet-4-6"]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			metaPatch: {
				charged: true,
				costNanos: 6400000000,
				pricedUsage: {
					requests: 2,
					input_tokens: 14,
					output_tokens: 5,
					total_tokens: 19,
				},
				pricingBreakdown: {
					total_nanos: 6400000000,
					completed_requests: 2,
					failed_requests: 0,
					total_requests: 2,
				},
			},
		});
		expect((state.statusCalls.at(-1)?.metaPatch.pricedUsage as any)?.pricing?.lines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ dimension: "input_text_tokens", quantity: 10, line_nanos: 1000000000 }),
				expect.objectContaining({ dimension: "output_text_tokens", quantity: 2, line_nanos: 400000000 }),
				expect.objectContaining({ dimension: "input_text_tokens", quantity: 4, line_nanos: 2000000000 }),
				expect.objectContaining({ dimension: "output_text_tokens", quantity: 3, line_nanos: 3000000000 }),
			]),
		);
	});

	it("prices xAI native batch results through the batch results endpoint", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_xai_native",
			status: "completed",
			meta: {
				provider: "x-ai",
				status: "completed",
				nativeBatchId: "batch_xai_native",
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
						results: [
							{
								batch_request_id: "xai-request-1",
								batch_result: {
									response: { chat_get_completion: {
										model: "grok-4",
										usage: { input_tokens: 8, output_tokens: 5, total_tokens: 13 },
									} },
								},
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_xai_native",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.fetchCalls).toEqual(["https://api.x.ai/v1/batches/batch_xai_native/results?limit=1000"]);
		expect(state.loadCalls).toContainEqual({
			provider: "spacex-ai",
			model: "spacex-ai/grok-4",
			endpoint: "text.generate",
		});
		expect(state.chargeCalls).toEqual([{
			requestId: "batch_capture:batch_xai_native",
			workspaceId: "ws_batch_test",
			cost_nanos: 1800000000,
		}]);
		expect(state.requestRows).toHaveLength(1);
		expect(state.requestRows[0]).toMatchObject({
			customId: "xai-request-1",
			provider: "x-ai",
			model: "grok-4",
			status: "completed",
			responseStatus: 200,
			usage: { input_tokens: 8, output_tokens: 5, total_tokens: 13 },
			costNanos: 1800000000,
		});
	});

	it("reads every xAI results page before settlement", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_xai_pages",
			status: "completed",
			meta: { provider: "x-ai", nativeBatchId: "batch_xai_pages", requestCounts: { total: 2, completed: 2, failed: 0 } },
		};
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			state.fetchCalls.push(url);
			const second = url.includes("pagination_token=next-page");
			return new Response(JSON.stringify({
				results: [{
					batch_request_id: second ? "two" : "one",
					batch_result: { response: { chat_get_completion: { model: "grok-4", usage: { input_tokens: 1, output_tokens: 1 } } } },
				}],
				...(second ? {} : { pagination_token: "next-page" }),
			}), { status: 200, headers: { "Content-Type": "application/json" } });
		}));
		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({ workspaceId: "ws_batch_test", batchId: "batch_xai_pages", status: "completed" }))
			.resolves.toMatchObject({ billed: true });
		expect(state.fetchCalls).toHaveLength(2);
		expect(state.requestRows.map((row) => row.customId)).toEqual(["one", "two"]);
	});

	it("marks completed free moderation batches billed from successful output rows", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_moderation_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/moderations",
				model: "openai/omni-moderation",
				outputFileId: "file_out_moderation_123",
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
						custom_id: "row-moderation-1",
						response: {
							status_code: 200,
							body: {
								id: "modr_123",
								model: "openai/omni-moderation",
								results: [{ flagged: false }],
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
			batchId: "batch_moderation_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			billed: true,
			reason: "zero_cost",
		});
		expect(state.fetchCalls).toEqual(["https://api.openai.example/v1/files/file_out_moderation_123/content"]);
		expect(state.loadCalls.map((call) => call.endpoint)).toEqual(["moderation", "text.moderate"]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.walletCalls).toEqual([]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_moderation_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			workspaceId: "ws_batch_test",
			batchId: "batch_moderation_123",
			status: "completed",
			metaPatch: {
				charged: false,
				costNanos: 0,
				billingReason: "zero_cost",
				pricedUsage: {
					requests: 1,
				},
				pricingBreakdown: {
					total_nanos: 0,
					completed_requests: 1,
					total_requests: 1,
				},
			},
		});
	});

	it("charges completed image batches from output image count and input request options", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_image_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/images/generations",
				model: "openai/gpt-image-1-mini",
				inputFileId: "file_in_image_123",
				outputFileId: "file_out_image_123",
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
				const url = String(input);
				state.fetchCalls.push(url);
				if (url.endsWith("/files/file_out_image_123/content")) {
					return new Response(
						JSON.stringify({
							custom_id: "row-image-1",
							response: {
								status_code: 200,
								body: {
									created: 1,
									data: [{ b64_json: "a" }, { b64_json: "b" }],
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/jsonl" } },
					);
				}
				if (url.endsWith("/files/file_in_image_123/content")) {
					return new Response(
						JSON.stringify({
							custom_id: "row-image-1",
							method: "POST",
							url: "/v1/images/generations",
							body: {
								model: "openai/gpt-image-1-mini",
								prompt: "a quiet desk",
								n: 2,
								size: "1024x1024",
								quality: "high",
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/jsonl" } },
					);
				}
				throw new Error(`Unexpected fetch ${url}`);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_image_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged",
		});
		expect(state.fetchCalls).toEqual([
			"https://api.openai.example/v1/files/file_out_image_123/content",
			"https://api.openai.example/v1/files/file_in_image_123/content",
		]);
		expect(state.loadCalls.map((call) => call.endpoint)).toEqual(["image.generate"]);
		expect(state.chargeCalls).toEqual([
			{
				requestId: "batch_capture:batch_image_123",
				workspaceId: "ws_batch_test",
				cost_nanos: 500_000_000,
			},
		]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_image_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 500_000_000,
				billingReason: "charged",
				pricedUsage: {
					requests: 1,
					output_image: 2,
					pricing: {
						lines: [
							{
								dimension: "output_image",
								quantity: 2,
								billable_units: 2,
								line_nanos: 500_000_000,
								pricing_plan: "batch",
								service_tier: "batch",
							},
						],
					},
				},
				pricingBreakdown: {
					total_nanos: 500_000_000,
					completed_requests: 1,
					total_requests: 1,
				},
			},
		});
	});

	it("leaves paid batches unbilled when successful output rows match no pricing rule", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_image_unmatched_price_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/images/generations",
				model: "openai/gpt-image-1-mini",
				inputFileId: "file_in_image_unmatched",
				outputFileId: "file_out_image_unmatched",
				reservationId: "batch_hold:req_image_unmatched",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
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
				const url = String(input);
				state.fetchCalls.push(url);
				if (url.endsWith("/files/file_out_image_unmatched/content")) {
					return new Response(
						JSON.stringify({
							custom_id: "row-image-unmatched-1",
							response: {
								status_code: 200,
								body: {
									created: 1,
									data: [{ b64_json: "a" }],
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/jsonl" } },
					);
				}
				if (url.endsWith("/files/file_in_image_unmatched/content")) {
					return new Response(
						JSON.stringify({
							custom_id: "row-image-unmatched-1",
							method: "POST",
							url: "/v1/images/generations",
							body: {
								model: "openai/gpt-image-1-mini",
								prompt: "a quiet desk",
								n: 1,
								size: "512x512",
								quality: "low",
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/jsonl" } },
					);
				}
				throw new Error(`Unexpected fetch ${url}`);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_image_unmatched_price_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			billed: false,
			reason: "price_card_missing",
		});
		expect(state.walletCalls).toEqual([]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: false,
				billingReason: "price_card_missing",
			},
		});
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
		expect(state.walletCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "failed",
			metaPatch: {
				charged: false,
				costNanos: 0,
				billingReason: "failed",
			},
		});
	});

	it("releases Anthropic holds when terminal counts explicitly report zero completions", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_anthropic_failed_zero_completed",
			status: "failed",
			meta: {
				provider: "anthropic",
				status: "failed",
				endpoint: "/v1/messages/batches",
				reservationId: "batch_hold:req_anthropic_zero_completed",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
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
			batchId: "batch_anthropic_failed_zero_completed",
			status: "failed",
		});

		expect(result).toEqual({
			status: "failed",
			charged: false,
			billed: true,
			reason: "released_released",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.walletCalls).toEqual([{
			op: "release",
			workspaceId: "ws_batch_test",
			reservationId: "batch_hold:req_anthropic_zero_completed",
			releaseRefId: "batch_anthropic_failed_zero_completed",
		}]);
		expect(state.chargeCalls).toEqual([]);
	});

	it("ignores stale terminal status changes without charging or releasing reservations", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_stale_terminal_123",
			status: "failed",
			meta: {
				provider: "openai",
				status: "failed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_stale",
				reservationId: "batch_hold:req_stale_terminal",
				reservedNanos: 500_000_000,
				reservationStatus: "released_failed",
				requestCounts: {
					total: 1,
					completed: 0,
					failed: 1,
				},
			},
		};

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_stale_terminal_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "failed",
			charged: false,
			billed: false,
			reason: "stale_terminal_status",
		});
		expect(state.fetchCalls).toEqual([]);
		expect(state.walletCalls).toEqual([]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls).toEqual([]);
	});

	it("prices cancelled batches with successful output even when provider counts are absent", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_partial_no_counts",
			status: "cancelled",
			meta: {
				provider: "openai",
				apiKeyId: "key_batch_test",
				status: "cancelled",
				endpoint: "/v1/responses",
				outputFileId: "file_cancelled_partial",
				reservationId: "batch_hold:req_cancelled_partial",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
			},
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			custom_id: "partial-1",
			response: {
				status_code: 200,
				body: {
					model: "openai/gpt-4o-mini",
					usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
				},
			},
		}), { status: 200, headers: { "Content-Type": "application/jsonl" } })));

		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_partial_no_counts",
			status: "cancelled",
		})).resolves.toMatchObject({ billed: true, charged: true, status: "cancelled" });
		expect(state.walletCalls).toContainEqual({
			op: "settle",
			workspaceId: "ws_batch_test",
			keyId: "key_batch_test",
			reservationId: "batch_hold:req_cancelled_partial",
			actualNanos: 400_000_000,
			settleRefId: "batch_cancelled_partial_no_counts",
		});
		expect(state.keyUsageCalls).toEqual([expect.objectContaining({
			name: "gateway_record_batch_key_usage",
			args: expect.objectContaining({
				p_workspace_id: "ws_batch_test",
				p_key_id: "key_batch_test",
				p_batch_id: "batch_cancelled_partial_no_counts",
			}),
		})]);
	});

	it("releases reserved credits for cancelled batches without charging usage", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_123",
			status: "cancelled",
			meta: {
				provider: "openai",
				status: "cancelled",
				endpoint: "/v1/responses",
				reservationId: "batch_hold:req_cancelled",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
				requestCounts: {
					total: 2,
					completed: 0,
					failed: 0,
				},
			},
		};

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_123",
			status: "cancelled",
		});

		expect(result).toEqual({
			status: "cancelled",
			charged: false,
			billed: true,
			reason: "released_released",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "release",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_cancelled",
				releaseRefId: "batch_cancelled_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_cancelled_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "cancelled",
			metaPatch: {
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: "released_released",
				reservationStatus: "released_released",
			},
		});
	});

	it("releases definitively rejected native-result batches without fetching output", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_rejected_anthropic",
			status: "failed",
			meta: {
				provider: "anthropic",
				status: "failed",
				submissionOutcome: "rejected",
				reservationId: "batch_hold:req_rejected_anthropic",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
			},
		};
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_rejected_anthropic",
			status: "failed",
		})).resolves.toMatchObject({ billed: true, charged: false });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(state.walletCalls).toEqual([expect.objectContaining({
			op: "release",
			reservationId: "batch_hold:req_rejected_anthropic",
		})]);
	});

	it("finalizes released xAI failures without inventing a provider batch id", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_failed_xai_without_native_id",
			status: "failed",
			meta: {
				provider: "x-ai",
				status: "submitting",
				reservationId: "batch_hold:req_failed_xai",
				reservedNanos: 122_100,
				reservationStatus: "released",
			},
		};
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_failed_xai_without_native_id",
			status: "failed",
		})).resolves.toMatchObject({ billed: true, charged: false });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(state.walletCalls).toEqual([expect.objectContaining({
			op: "release",
			reservationId: "batch_hold:req_failed_xai",
		})]);
	});

	it("does not mark voided batches billed when reservation release fails", async () => {
		state.releaseError = new Error("wallet release timeout");
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_release_failed_123",
			status: "cancelled",
			meta: {
				provider: "openai",
				status: "cancelled",
				endpoint: "/v1/responses",
				reservationId: "batch_hold:req_cancelled_release_failed",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
				requestCounts: {
					total: 2,
					completed: 0,
					failed: 0,
				},
			},
		};

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_cancelled_release_failed_123",
			status: "cancelled",
		});

		expect(result).toEqual({
			status: "cancelled",
			charged: false,
			billed: false,
			reason: "release_failed",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "release",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_cancelled_release_failed",
				releaseRefId: "batch_cancelled_release_failed_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "cancelled",
			metaPatch: {
				charged: false,
				costNanos: 0,
				costUsd: 0,
				billingReason: "release_failed",
				reservationStatus: "release_failed",
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

	it("settles completed embedding batches using text.embed pricing", async () => {
		state.captureResult = {
			status: "captured",
			applied: true,
			alreadyApplied: false,
			amountNanos: 300_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_embeddings_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/embeddings",
				outputFileId: "file_out_embeddings",
				reservationId: "batch_hold:req_embeddings",
				reservedNanos: 300_000_000,
				reservationStatus: "held",
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
								model: "openai/text-embedding-3-small",
								usage: { input_tokens: 6, embedding_tokens: 6, total_tokens: 6 },
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
			batchId: "batch_embeddings_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged:captured",
		});
		expect(state.loadCalls).toEqual([
			{ provider: "openai", model: "openai/text-embedding-3-small", endpoint: "text.embed" },
		]);
		expect(state.walletCalls).toEqual([
			{
				op: "settle",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_embeddings",
				actualNanos: 300_000_000,
				settleRefId: "batch_embeddings_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_embeddings_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 300_000_000,
				billingReason: "charged:captured",
				reservationStatus: "captured",
				pricedUsage: {
					input_text_tokens: 6,
					embedding_tokens: 6,
				},
			},
		});
	});

	it("settles completed video batches from output rows and matching input request metadata", async () => {
		state.captureResult = {
			status: "captured",
			applied: true,
			alreadyApplied: false,
			amountNanos: 300_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_video_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/videos",
				inputFileId: "file_in_video",
				outputFileId: "file_out_video",
				reservationId: "batch_hold:req_video",
				reservedNanos: 300_000_000,
				reservationStatus: "held",
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
				const url = String(input);
				state.fetchCalls.push(url);
				if (url.endsWith("/files/file_out_video/content")) {
					return new Response(
						JSON.stringify({
							custom_id: "row-video-1",
							response: {
								status_code: 200,
								body: {
									id: "video_out_123",
									model: "openai/sora-2",
									status: "completed",
									seconds: 6,
								},
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/jsonl" } },
					);
				}
				return new Response(
					JSON.stringify({
						custom_id: "row-video-1",
						method: "POST",
						url: "/v1/videos",
						body: {
							model: "openai/sora-2",
							prompt: "waves at sunset",
							seconds: 6,
							size: "1280x720",
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/jsonl" } },
				);
			}),
		);

		const { finalizeBatchJob } = await import("./batch-finalization");
		const result = await finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_video_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged:captured",
		});
		expect(state.fetchCalls).toEqual([
			"https://api.openai.example/v1/files/file_out_video/content",
			"https://api.openai.example/v1/files/file_in_video/content",
		]);
		expect(state.loadCalls).toEqual([
			{ provider: "openai", model: "openai/sora-2", endpoint: "video.generation" },
			{ provider: "openai", model: "openai/sora-2", endpoint: "video.generate" },
		]);
		expect(state.walletCalls).toEqual([
			{
				op: "settle",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_video",
				actualNanos: 300_000_000,
				settleRefId: "batch_video_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([{ workspaceId: "ws_batch_test", batchId: "batch_video_123" }]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 300_000_000,
				billingReason: "charged:captured",
				reservationStatus: "captured",
				pricedUsage: {
					output_video_seconds: 6,
				},
			},
		});
	});

	it("atomically settles a conservative reservation at actual completed batch usage", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_reserved_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_reserved",
				reservationId: "batch_hold:req_reserved",
				reservedNanos: 1_500_000_000,
				reservationStatus: "held",
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
								usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
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
			batchId: "batch_reserved_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged:captured",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "settle",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_reserved",
				actualNanos: 400_000_000,
				settleRefId: "batch_reserved_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 400_000_000,
				billingReason: "charged:captured",
				reservationStatus: "captured",
			},
		});
	});

	it("finishes bookkeeping after a prior attempt already captured the exact charge", async () => {
		state.captureResult = {
			status: "captured",
			applied: false,
			alreadyApplied: true,
			amountNanos: 400_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_captured_before_mark_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_captured_before_mark",
				reservationId: "batch_hold:req_captured_before_mark",
				reservedNanos: 500_000_000,
				reservationStatus: "held",
				requestCounts: { total: 1, completed: 1, failed: 0 },
			},
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			response: {
				status_code: 200,
				body: {
					model: "openai/gpt-4o-mini",
					usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
				},
			},
		}), { status: 200, headers: { "Content-Type": "application/jsonl" } })));

		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({
			workspaceId: "ws_batch_test",
			batchId: "batch_captured_before_mark_123",
			status: "completed",
		})).resolves.toEqual({
			status: "completed",
			charged: true,
			billed: true,
			reason: "charged:already_captured",
		});
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([
			{ workspaceId: "ws_batch_test", batchId: "batch_captured_before_mark_123" },
		]);
	});

	it("keeps exact-cost batches unbilled when the reservation was already released", async () => {
		state.captureResult = {
			status: "released",
			applied: false,
			alreadyApplied: true,
			amountNanos: 400_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_released_exact_123",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				endpoint: "/v1/responses",
				outputFileId: "file_out_released_exact",
				reservationId: "batch_hold:req_released_exact",
				reservedNanos: 400_000_000,
				reservationStatus: "held",
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
								usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
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
			batchId: "batch_released_exact_123",
			status: "completed",
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			billed: false,
			reason: "settlement_not_applied:released",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "settle",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_released_exact",
				actualNanos: 400_000_000,
				settleRefId: "batch_released_exact_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: false,
				billingReason: "settlement_not_applied:released",
				reservationStatus: "released",
			},
		});
	});

	it("leaves batches unbilled when provider success counts exceed downloaded rows", async () => {
		state.record = {
			workspaceId: "ws_batch_test",
			batchId: "batch_incomplete_results",
			status: "completed",
			meta: {
				provider: "openai",
				status: "completed",
				outputFileId: "file_incomplete",
				requestCounts: { total: 2, completed: 2, failed: 0 },
			},
		};
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			custom_id: "only-one",
			response: { status_code: 200, body: { model: "gpt-4o-mini", usage: { input_tokens: 1, output_tokens: 1 } } },
		}), { status: 200 })));
		const { finalizeBatchJob } = await import("./batch-finalization");
		await expect(finalizeBatchJob({ workspaceId: "ws_batch_test", batchId: "batch_incomplete_results", status: "completed" }))
			.resolves.toMatchObject({ billed: false, reason: "successful_output_count_mismatch" });
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
	});
});
