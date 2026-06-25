import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	billCalls: [] as any[],
	priceCardCalls: [] as any[],
	reserveCalls: [] as any[],
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://api.openai.example",
	}),
}));

vi.mock("@providers/keys", () => ({
	resolveProviderKey: vi.fn(() => ({ key: "test-openai-key" })),
}));

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: vi.fn(async (...args: any[]) => {
		state.priceCardCalls.push(args);
		if (args[2] === "video.generation") return null;
		if (args[2] === "moderation") return null;
		if (args[2] === "video.generate") {
			return {
				id: "test-video-price-card",
				rules: [
					{
						meter: "output_video_seconds",
						unit: "second",
						unit_size: 1,
						price_per_unit: 0.05,
						currency: "USD",
						pricing_plan: "batch",
						match: [],
						priority: 100,
					},
				],
			};
		}
		if (args[2] === "image.generate") {
			return {
				id: "test-image-standard-price-card",
				rules: [
					{
						meter: "output_image",
						unit: "image",
						unit_size: 1,
						price_per_unit: 0.04,
						currency: "USD",
						pricing_plan: "standard",
						match: [],
						priority: 100,
					},
				],
			};
		}
		if (args[2] === "text.moderate") {
			return {
				id: "test-moderation-free-price-card",
				rules: [
					{
						meter: "requests",
						unit: "request",
						unit_size: 1,
						price_per_unit: 0,
						currency: "USD",
						pricing_plan: "free",
						match: [],
						priority: 100,
					},
				],
			};
		}
		return {
			id: "test-price-card",
			rules: [
				{
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1,
					price_per_unit: 0.01,
					currency: "USD",
					pricing_plan: "batch",
					match: [],
					priority: 100,
				},
			],
		};
	}),
}));

vi.mock("@pipeline/pricing/engine", () => ({
	computeBill: vi.fn((usage: any, card: any, context: any, mode: string) => {
		state.billCalls.push({ usage, card, context, mode });
		if (String(context?.model ?? "").includes("unmatched")) {
			return { pricing: { total_nanos: 0, lines: [] } };
		}
		if (mode === "free" || context?.pricing_plan === "free") {
			return { pricing: { total_nanos: 0, lines: [{ dimension: "requests", line_nanos: 0 }] } };
		}
		return { pricing: { total_nanos: 123_000_000, lines: [{ dimension: "input_text_tokens", line_nanos: 123_000_000 }] } };
	}),
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: any) => {
		state.reserveCalls.push(args);
		return { status: "held", applied: true, alreadyApplied: false };
	}),
}));

import { reserveBatchCredits } from "./batch-reservations";

describe("reserveBatchCredits", () => {
	beforeEach(() => {
		state.billCalls = [];
		state.priceCardCalls = [];
		state.reserveCalls = [];
		vi.unstubAllGlobals();
	});

	it("prices and holds OpenAI batch rows using the per-request body model", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-1",
				method: "POST",
				url: "/v1/responses",
				body: {
					model: "openai/gpt-5-mini",
					input: "hello",
					max_output_tokens: 16,
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_123",
			inputFileId: "file_batch_input",
			endpoint: "/v1/responses",
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.openai.example/v1/files/file_batch_input/content",
			expect.objectContaining({
				method: "GET",
				headers: { Authorization: "Bearer test-openai-key" },
			}),
		);
		expect(state.priceCardCalls).toContainEqual(["openai", "openai/gpt-5-mini", "text.generate"]);
		expect(state.billCalls).toHaveLength(1);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: "/responses",
				batch_capability: "text.generate",
				model: "openai/gpt-5-mini",
			},
			mode: "batch",
			usage: {
				output_text_tokens: 16,
				output_tokens: 16,
			},
		});
		expect(state.reserveCalls).toEqual([
			{
				workspaceId: "ws_test",
				reservationId: "batch_hold:batch_req_123",
				amountNanos: 123_000_000,
				holdRefId: "batch_req_123",
			},
		]);
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_123",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
			estimatedUsage: {
				requests: 1,
				output_text_tokens: 16,
				pricing: {
					total_nanos: 123_000_000,
					total_usd_str: "0.123000000",
					currency: "USD",
				},
			},
		});
	});

	it("treats legacy completions batches as text generation for reservation pricing", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-completions-1",
				method: "POST",
				url: "/v1/completions",
				body: {
					model: "openai/babbage-002",
					prompt: "hello",
					max_tokens: 12,
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_completions",
			inputFileId: "file_batch_input",
			endpoint: "/v1/completions",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/babbage-002", "text.generate"]);
		expect(state.priceCardCalls).toEqual([["openai", "openai/babbage-002", "text.generate"]]);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: "/completions",
				batch_capability: "text.generate",
				model: "openai/babbage-002",
			},
			mode: "batch",
			usage: {
				output_text_tokens: 12,
				output_tokens: 12,
			},
		});
		expect(result).toMatchObject({
			held: true,
			status: "held",
			amountNanos: 123_000_000,
		});
	});

	it("fails closed when a batch row has no model and no top-level fallback", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-1",
				method: "POST",
				url: "/v1/responses",
				body: {
					input: "hello",
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_missing_model",
			inputFileId: "file_batch_input",
			endpoint: "/v1/responses",
		});

		expect(result).toEqual({
			reservationId: "batch_hold:batch_req_missing_model",
			held: false,
			amountNanos: 0,
			status: "skip_missing_model",
		});
		expect(state.billCalls).toEqual([]);
		expect(state.reserveCalls).toEqual([]);
	});

	it("fails closed when a batch row has no priceable request body", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-missing-body",
				method: "POST",
				url: "/v1/responses",
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_missing_body",
			inputFileId: "file_batch_input",
			endpoint: "/v1/responses",
			model: "openai/gpt-5-mini",
		});

		expect(result).toEqual({
			reservationId: "batch_hold:batch_req_missing_body",
			held: false,
			amountNanos: 0,
			status: "skip_invalid_input_row",
		});
		expect(state.priceCardCalls).toEqual([]);
		expect(state.billCalls).toEqual([]);
		expect(state.reserveCalls).toEqual([]);
	});

	it("fails closed when a batch row targets an unsupported endpoint", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-unsupported-1",
				method: "POST",
				url: "/v1/audio/speech",
				body: {
					model: "openai/gpt-4o-mini-tts",
					input: "hello",
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_unsupported_endpoint",
			inputFileId: "file_batch_input",
			endpoint: "/v1/responses",
		});

		expect(result).toEqual({
			reservationId: "batch_hold:batch_req_unsupported_endpoint",
			held: false,
			amountNanos: 0,
			status: "skip_unsupported_endpoint",
		});
		expect(state.priceCardCalls).toEqual([]);
		expect(state.billCalls).toEqual([]);
		expect(state.reserveCalls).toEqual([]);
	});

	it("prices embedding batch rows without adding a generated-output hold", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-embed-1",
				method: "POST",
				url: "/v1/embeddings",
				body: {
					model: "openai/text-embedding-3-small",
					input: ["alpha", "beta"],
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_embeddings",
			inputFileId: "file_batch_embeddings_input",
			endpoint: "/v1/embeddings",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/text-embedding-3-small", "text.embed"]);
		expect(state.billCalls).toHaveLength(1);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: "/embeddings",
				batch_capability: "text.embed",
				model: "openai/text-embedding-3-small",
			},
			mode: "batch",
			usage: {
				input_text_tokens: 3,
				input_tokens: 3,
				output_text_tokens: 0,
				output_tokens: 0,
				embedding_tokens: 3,
				total_tokens: 3,
			},
		});
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_embeddings",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
			estimatedUsage: {
				requests: 1,
				input_text_tokens: 3,
				output_text_tokens: 0,
				embedding_tokens: 3,
				total_tokens: 3,
			},
		});
	});

	it("prices video batch rows from requested seconds and size", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-video-1",
				method: "POST",
				url: "/v1/videos",
				body: {
					model: "openai/sora-2",
					prompt: "waves at sunset",
					seconds: 6,
					size: "1280x720",
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_video",
			inputFileId: "file_batch_video_input",
			endpoint: "/v1/videos",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/sora-2", "video.generate"]);
		expect(state.billCalls).toHaveLength(1);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				model: "openai/sora-2",
				size: "1280x720",
				video_params: {
					resolution: "1280x720",
					seconds: 6,
				},
			},
			usage: {
				output_video_seconds: 6,
			},
		});
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_video",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
			estimatedUsage: {
				requests: 1,
				output_text_tokens: 0,
				output_video_seconds: 6,
			},
		});
	});

	it("fails closed for video batch rows without a duration estimate", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-video-missing-seconds",
				method: "POST",
				url: "/v1/videos",
				body: {
					model: "openai/sora-2",
					prompt: "waves at sunset",
					size: "1280x720",
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_video_missing_seconds",
			inputFileId: "file_batch_video_input",
			endpoint: "/v1/videos",
		});

		expect(result).toEqual({
			reservationId: "batch_hold:batch_req_video_missing_seconds",
			held: false,
			amountNanos: 0,
			status: "skip_missing_video_seconds",
		});
		expect(state.reserveCalls).toEqual([]);
	});

	it("prices image batch rows with derived OpenAI batch pricing", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-image-1",
				method: "POST",
				url: "/v1/images/generations",
				body: {
					model: "openai/gpt-image-1-mini",
					prompt: "a quiet desk",
					size: "1024x1024",
					quality: "high",
					n: 2,
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_image",
			inputFileId: "file_batch_image_input",
			endpoint: "/v1/images/generations",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/gpt-image-1-mini", "image.generate"]);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: "/images/generations",
				batch_capability: "image.generate",
				model: "openai/gpt-image-1-mini",
				size: "1024x1024",
				quality: "high",
				image_params: {
					resolution: "1024x1024",
					quality: "high",
				},
			},
			mode: "batch",
			usage: {
				output_image: 2,
				input_text_tokens: 3,
			},
		});
		expect((state.billCalls[0].card.rules[0] as any).pricing_plan).toBe("batch");
		expect((state.billCalls[0].card.rules[0] as any).price_per_unit).toBe("0.02");
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_image",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
			estimatedUsage: {
				requests: 1,
				output_image: 2,
			},
		});
	});

	it("allows free moderation batch rows without reserving wallet credits", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-moderation-1",
				method: "POST",
				url: "/v1/moderations",
				body: {
					model: "openai/omni-moderation",
					input: "check this text",
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_moderation",
			inputFileId: "file_batch_moderation_input",
			endpoint: "/v1/moderations",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/omni-moderation", "text.moderate"]);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "free",
				service_tier: "batch",
				batch_endpoint: "/moderations",
				batch_capability: "text.moderate",
				model: "openai/omni-moderation",
			},
			mode: "free",
			usage: {
				requests: 1,
			},
		});
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_moderation",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
			estimatedUsage: {
				requests: 1,
				pricing: {
					total_nanos: 0,
				},
			},
		});
		expect(state.reserveCalls).toEqual([]);
	});

	it("fails closed when paid batch pricing has no matching rule", async () => {
		const fetchMock = vi.fn(async () => {
			const row = {
				custom_id: "row-unmatched-1",
				method: "POST",
				url: "/v1/responses",
				body: {
					model: "openai/unmatched-batch-model",
					input: "hello",
					max_output_tokens: 16,
				},
			};
			return new Response(`${JSON.stringify(row)}\n`, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_unmatched_pricing",
			inputFileId: "file_batch_unmatched_input",
			endpoint: "/v1/responses",
		});

		expect(state.priceCardCalls).toContainEqual(["openai", "openai/unmatched-batch-model", "text.generate"]);
		expect(state.billCalls).toHaveLength(1);
		expect(state.billCalls[0]).toMatchObject({
			context: {
				pricing_plan: "batch",
				service_tier: "batch",
				batch_endpoint: "/responses",
				batch_capability: "text.generate",
				model: "openai/unmatched-batch-model",
			},
			mode: "batch",
		});
		expect(result).toEqual({
			reservationId: "batch_hold:batch_req_unmatched_pricing",
			held: false,
			amountNanos: 0,
			status: "skip_price_card_missing",
		});
		expect(state.reserveCalls).toEqual([]);
	});

	it("scales sampled estimates for oversized batch files instead of under-holding", async () => {
		const row = {
			custom_id: "row-1",
			method: "POST",
			url: "/v1/responses",
			body: {
				model: "openai/gpt-5-mini",
				input: "hello",
				max_output_tokens: 1,
			},
		};
		const jsonl = `${Array.from({ length: 50_001 }, () => JSON.stringify(row)).join("\n")}\n`;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(jsonl, { status: 200 })),
		);

		const result = await reserveBatchCredits({
			workspaceId: "ws_test",
			batchId: "batch_req_large",
			inputFileId: "file_batch_large_input",
			endpoint: "/v1/responses",
		});

		expect(state.billCalls).toHaveLength(50_000);
		expect(state.reserveCalls).toEqual([
			{
				workspaceId: "ws_test",
				reservationId: "batch_hold:batch_req_large",
				amountNanos: 123_000_000 * 50_001,
				holdRefId: "batch_req_large",
			},
		]);
		expect(result).toMatchObject({
			reservationId: "batch_hold:batch_req_large",
			held: true,
			amountNanos: 123_000_000 * 50_001,
			status: "held",
			estimatedUsage: {
				requests: 50_001,
				output_text_tokens: 50_001,
				estimation_truncated: true,
				estimation_sample_size: 50_000,
				estimation_total_rows: 50_001,
				pricing: {
					total_nanos: 123_000_000 * 50_001,
					total_usd_str: "6150.123000000",
				},
			},
		});
	});
});
