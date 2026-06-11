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
	walletCalls: [] as Array<Record<string, unknown>>,
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
	state.fetchCalls = [];
	state.walletCalls = [];
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
				op: "capture",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_embeddings",
				captureRefId: "batch_embeddings_123",
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
				op: "capture",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_video",
				captureRefId: "batch_video_123",
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

	it("releases a mismatched reservation and charges actual completed batch usage", async () => {
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
			reason: "charged:released_and_charged_actual",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "release",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_reserved",
				releaseRefId: "batch_reserved_123",
			},
		]);
		expect(state.chargeCalls).toEqual([
			{
				requestId: "batch_capture:batch_reserved_123",
				workspaceId: "ws_batch_test",
				cost_nanos: 400_000_000,
			},
		]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: true,
				costNanos: 400_000_000,
				billingReason: "charged:released_and_charged_actual",
				reservationStatus: "released_and_charged_actual",
			},
		});
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
			reason: "charged:released",
		});
		expect(state.walletCalls).toEqual([
			{
				op: "capture",
				workspaceId: "ws_batch_test",
				reservationId: "batch_hold:req_released_exact",
				captureRefId: "batch_released_exact_123",
			},
		]);
		expect(state.chargeCalls).toEqual([]);
		expect(state.markCalls).toEqual([]);
		expect(state.statusCalls.at(-1)).toMatchObject({
			status: "completed",
			metaPatch: {
				charged: false,
				costNanos: 400_000_000,
				billingReason: "charged:released",
				reservationStatus: "released",
			},
		});
	});
});
