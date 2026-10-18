import { describe, expect, it } from "vitest";
import { normalizeProviderModelPricing } from "./pricing-normalizers";

describe("normalizeProviderModelPricing", () => {
	it("normalizes per-token prices to per-million-token meters", () => {
		expect(
			normalizeProviderModelPricing("inception", {
				pricing: { prompt: "0.00000025", completion: "0.00000075", input_cache_reads: "0.000000025" },
			}),
		).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: {
				cached_read_text_tokens: 0.025,
				input_text_tokens: 0.25,
				output_text_tokens: 0.75,
			},
		});
	});

	it("normalizes nested USD prices from Venice", () => {
		expect(
			normalizeProviderModelPricing("venice", {
				model_spec: {
					pricing: {
						input: { usd: 1.4 },
						cache_input: { usd: 0.26 },
						output: { usd: 4.4 },
					},
				},
			}),
		).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: {
				cached_read_text_tokens: 0.26,
				input_text_tokens: 1.4,
				output_text_tokens: 4.4,
			},
		});
	});

	it("preserves only token prices for DeepInfra multimodal records", () => {
		expect(
			normalizeProviderModelPricing("deepinfra", {
				metadata: { pricing: { input_tokens: 0.93, output_tokens: 3, per_image_unit: 0.04 } },
			}),
		).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: { input_text_tokens: 0.93, output_text_tokens: 3 },
		});
	});

	it("converts xAI cents per hundred-million tokens into dollars per million", () => {
		expect(
			normalizeProviderModelPricing("spacex-ai", {
				prompt_text_token_price: 12_500,
				cached_prompt_text_token_price: 2_000,
				completion_text_token_price: 25_000,
			}),
		).toMatchObject({
			meters: {
				input_text_tokens: 1.25,
				cached_read_text_tokens: 0.2,
				output_text_tokens: 2.5,
			},
		});
	});

	it("normalizes the canonical Novita provider id", () => {
		expect(normalizeProviderModelPricing("novita", {
			input_token_price_per_m: 0.2,
			output_token_price_per_m: 0.8,
		})).toMatchObject({
			meters: { input_text_tokens: 0.2, output_text_tokens: 0.8 },
		});
	});

	it("normalizes external aggregator pricing", () => {
		expect(normalizeProviderModelPricing("openrouter", {
			pricing: {
				prompt: "0.0000004",
				completion: "0.0000016",
				input_cache_read: "0.00000008",
				input_cache_write: "0.0000005",
			},
		})).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: {
				cached_read_text_tokens: 0.08,
				cached_write_text_tokens: 0.5,
				input_text_tokens: 0.4,
				output_text_tokens: 1.6,
			},
		});
	});

	it("normalizes external-provider multimodal pricing meters", () => {
		expect(normalizeProviderModelPricing("openrouter", {
			pricing: {
				prompt: "0.0000003",
				completion: "0.0000025",
				image: "0.0000003",
				image_output: "0.00003",
				audio: "0.000001",
				audio_output: "0.000002",
				input_audio_cache: "0.0000001",
				internal_reasoning: "0.0000025",
			},
		})).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: {
				cached_read_audio_tokens: 0.1,
				input_audio_tokens: 1,
				input_image_tokens: 0.3,
				input_text_tokens: 0.3,
				output_audio_tokens: 2,
				output_image_tokens: 30,
				output_reasoning_tokens: 2.5,
				output_text_tokens: 2.5,
			},
		});
	});

	it("normalizes W&B provider-owned catalog costs", () => {
		expect(normalizeProviderModelPricing("weights-and-biases", {
			cost: { input: 0.03, output: 0.17, cache_read: 0.03 },
		})).toMatchObject({
			meters: {
				input_text_tokens: 0.03,
				cached_read_text_tokens: 0.03,
				output_text_tokens: 0.17,
			},
		});
	});

	it("normalizes DigitalOcean catalog prices whether returned per-token or per-million", () => {
		expect(normalizeProviderModelPricing("digitalocean", {
			pricing: {
				input_price_per_million: 0.0000005,
				output_price_per_million: 1.6,
				cache_read_input_price_per_million: 0.00000005,
			},
		})).toMatchObject({
			meters: {
				input_text_tokens: 0.5,
				cached_read_text_tokens: 0.05,
				output_text_tokens: 1.6,
			},
		});
	});

	it("does not flatten EmpirioLabs context tiers into a misleading base price", () => {
		expect(normalizeProviderModelPricing("empiriolabs", {
			pricing: [
				{ prompt: "0.0000005", completion: "0.0000015" },
				{ min_context: 200_000, prompt: "0.000001", completion: "0.000003" },
			],
		})).toBeNull();
	});

	it("normalizes Vercel AI Gateway per-token prices", () => {
		expect(normalizeProviderModelPricing("vercel", {
			pricing: { input: "0.00000012", output: "0.00000024" },
		})).toMatchObject({
			meters: { input_text_tokens: 0.12, output_text_tokens: 0.24 },
		});
	});


	it("normalizes only unconditional ZenMux token prices", () => {
		expect(normalizeProviderModelPricing("zenmux", {
			pricings: {
				prompt: [{ value: 1.25, unit: "perMTokens", currency: "USD" }],
				input_cache_read: [{ value: 0.15, unit: "perMTokens", currency: "USD" }],
				completion: [{ value: 4.25, unit: "perMTokens", currency: "USD" }],
			},
		})).toMatchObject({
			meters: { input_text_tokens: 1.25, cached_read_text_tokens: 0.15, output_text_tokens: 4.25 },
		});
		expect(normalizeProviderModelPricing("zenmux", {
			pricings: {
				prompt: [{ value: 1.25, unit: "perMTokens", currency: "USD", conditions: { prompt_tokens: { gte: 100 } } }],
				completion: [{ value: 4.25, unit: "perMTokens", currency: "USD" }],
			},
		})).toMatchObject({ meters: { output_text_tokens: 4.25 } });
	});

	it("normalizes public aggregator feeds", () => {
		expect(normalizeProviderModelPricing("fastino", {
			input_price_per_million: 1.5,
			cache_read_price_per_million: 0.15,
			output_price_per_million: 9,
		})).toMatchObject({ meters: { input_text_tokens: 1.5, cached_read_text_tokens: 0.15, output_text_tokens: 9 } });
		expect(normalizeProviderModelPricing("novita-ai", {
			input_token_price_per_m: 30000,
			output_token_price_per_m: 150000,
			pricing: { input_cache_read: { price_per_m: 3000 } },
		})).toMatchObject({ meters: { input_text_tokens: 3, cached_read_text_tokens: 0.3, output_text_tokens: 15 } });
		expect(normalizeProviderModelPricing("novita-ai", {
			input_token_price_per_m: 1500,
			output_token_price_per_m: 5000,
			pricing: {
				prompt: { price_per_m_decimal: "0.15" },
				completion: { price_per_m_decimal: "0.5" },
				input_cache_read: { price_per_m: 300, price_per_m_decimal: "0.03" },
			},
		})).toMatchObject({ meters: { input_text_tokens: 0.15, cached_read_text_tokens: 0.03, output_text_tokens: 0.5 } });
		expect(normalizeProviderModelPricing("requesty", {
			input_price: 0.0000025,
			cached_price: 0.00000025,
			output_price: 0.000015,
			pricing: [{ prompt_tokens_threshold: 0 }],
		})).toMatchObject({ meters: { input_text_tokens: 2.5, cached_read_text_tokens: 0.25, output_text_tokens: 15 } });
		expect(normalizeProviderModelPricing("requesty", {
			input_price: 0.0000025,
			output_price: 0.000015,
			pricing: [{ prompt_tokens_threshold: 0 }, { prompt_tokens_threshold: 272000 }],
		})).toBeNull();
	});
});
