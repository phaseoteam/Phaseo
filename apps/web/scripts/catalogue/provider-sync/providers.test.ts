import { describe, test, expect, vi } from "vitest";
import { getProviderSyncProvider, getProviderSyncProviderIds } from "./providers";
import { parseProviderModelList } from "./provider";

describe("provider sync registry", () => {
	test("registers explicit provider modules", () => {
		expect(getProviderSyncProviderIds()).toEqual([
			"deepinfra",
			"fastrouter",
			"mara",
			"novita-ai",
			"openrouter",
			"orcarouter",
			"pioneer",
			"poe",
			"requesty",
			"vercel",
			"zenmux",
		]);
	});

	test("fetches MARA's OpenAI-compatible model list with an optional bearer token", async () => {
		const provider = getProviderSyncProvider("mara");
		expect(provider).toBeDefined();
		const originalKey = process.env.MARA_API_KEY;
		process.env.MARA_API_KEY = "test-mara-key";
		const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.headers).toEqual({
				accept: "application/json",
				authorization: "Bearer test-mara-key",
			});
			return new Response(JSON.stringify({
				object: "list",
				data: [{
					id: "MiniMax-M2.7",
					context_length: 196608,
					max_completion_tokens: 196608,
					pricing: { prompt: "0.00000060", completion: "0.00000240" },
				}],
			}), { status: 200 });
		});

		try {
			const payload = await provider!.fetchModels(request);
			expect(provider!.parseModels(payload)).toEqual([
			{ id: "MiniMax-M2.7", details: expect.objectContaining({ context_length: 196608 }) },
		]);
			expect(request).toHaveBeenCalledWith(provider!.sourceUrl, expect.any(Object));
		} finally {
			if (originalKey === undefined) delete process.env.MARA_API_KEY;
			else process.env.MARA_API_KEY = originalKey;
		}
	});

	test("does not invent a zero DeepInfra cache price when no cache rate is published", () => {
		const provider = getProviderSyncProvider("deepinfra");
		const [model] = provider!.parseModels({
			current: { data: [{ id: "example/model" }] },
			details: [{
				model_name: "example/model",
				reported_type: "text-generation",
				pricing: {
					type: "tokens",
					cents_per_input_token: 0.00001,
					cents_per_output_token: 0.00002,
					rate_per_input_token_cached: null,
				},
			}],
		});
		expect(model?.details.metadata).toEqual({ pricing: { input_tokens: 0.1, output_tokens: 0.2 } });
	});

	test("parses DeepInfra embedding input-token pricing", () => {
		const provider = getProviderSyncProvider("deepinfra");
		const [model] = provider!.parseModels({
			current: { data: [{ id: "example/embedding-model" }] },
			details: [{
				model_name: "example/embedding-model",
				reported_type: "embeddings",
				pricing: {
					type: "input_tokens",
					cents_per_input_token: 0.000001,
				},
			}],
		});
		expect(model).toEqual(expect.objectContaining({
			details: expect.objectContaining({
				type: "embedding",
				metadata: { pricing: { input_tokens: 0.01 } },
			}),
		}));
	});

	test("joins DeepInfra's current inventory to its detailed pricing feed", async () => {
		const provider = getProviderSyncProvider("deepinfra");
		const originalKey = process.env.DEEPINFRA_API_KEY;
		process.env.DEEPINFRA_API_KEY = "test-deepinfra-key";
		const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input).includes("v1/openai/models")) {
				expect(init?.headers).toEqual({
					accept: "application/json",
					authorization: "Bearer test-deepinfra-key",
				});
			}
			return new Response(JSON.stringify(
			String(input).includes("v1/openai/models")
				? { data: [{ id: "example/model" }] }
				: [{
					model_name: "example/model",
					reported_type: "text-generation",
					max_tokens: 131072,
					pricing: {
						type: "tokens",
						cents_per_input_token: 0.00001,
						cents_per_output_token: 0.00002,
						rate_per_input_token_cached: 0.2,
					},
				}],
			), { status: 200 });
		});

		try {
			const payload = await provider!.fetchModels(request);
			expect(provider!.parseModels(payload)).toEqual([expect.objectContaining({
				id: "example/model",
				details: expect.objectContaining({
					context_length: 131072,
					metadata: { pricing: { input_tokens: 0.1, output_tokens: 0.2, cache_read_tokens: 0.02 } },
				}),
			})]);
		} finally {
			if (originalKey === undefined) delete process.env.DEEPINFRA_API_KEY;
			else process.env.DEEPINFRA_API_KEY = originalKey;
		}
	});

	test("parses common provider model list envelopes", () => {
		expect(parseProviderModelList({ models: [{ model_id: "example/model" }, { id: "second" }] })).toEqual([
			{ id: "example/model", details: { model_id: "example/model" } },
			{ id: "second", details: { id: "second" } },
		]);
	});

	test("does not duplicate Pioneer's Anthropic-compatible aliases", () => {
		const provider = getProviderSyncProvider("pioneer");
		expect(provider!.parseModels({ data: [
			{ id: "gpt-5.5" },
			{ id: "anthropic/pioneer/gpt-5.5" },
		] })).toEqual([
			{ id: "gpt-5.5", details: { id: "gpt-5.5" } },
		]);
	});

	test("fetches provider data with an optional bearer token", async () => {
		const provider = getProviderSyncProvider("openrouter");
		expect(provider).toBeDefined();
		const originalKey = process.env.OPENROUTER_API_KEY;
		process.env.OPENROUTER_API_KEY = "test-openrouter-key";
		const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			expect(init?.headers).toEqual({
				accept: "application/json",
				authorization: "Bearer test-openrouter-key",
			});
			return new Response(JSON.stringify({ data: [{ id: "example/model" }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});

		try {
			const payload = await provider!.fetchModels(request);
			expect(provider!.parseModels(payload)).toEqual([
			{ id: "example/model", details: { id: "example/model" } },
		]);
			expect(request).toHaveBeenCalledWith(provider!.sourceUrl, expect.any(Object));
		} finally {
			if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
			else process.env.OPENROUTER_API_KEY = originalKey;
		}
	});
});
