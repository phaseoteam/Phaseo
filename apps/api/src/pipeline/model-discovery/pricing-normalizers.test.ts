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

	it("normalizes Nebius Token Factory per-token prices", () => {
		expect(
			normalizeProviderModelPricing("nebius-token-factory", {
				pricing: { prompt: "0.00000015", completion: "0.0000006" },
			}),
		).toEqual({
			currency: "USD",
			unit: "per_1m_tokens",
			meters: { input_text_tokens: 0.15, output_text_tokens: 0.6 },
		});
	});
});
