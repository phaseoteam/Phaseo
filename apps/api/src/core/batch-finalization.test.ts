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

vi.mock("@core/batch-requests", () => ({
	saveBatchRequestRows: vi.fn(async (args: { rows: Array<Record<string, unknown>> }) => {
		state.requestRows.push(...args.rows);
	}),
}));

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: vi.fn(async (provider: string, model: string, endpoint: string) => {
		state.loadCalls.push({ provider, model, endpoint });
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
