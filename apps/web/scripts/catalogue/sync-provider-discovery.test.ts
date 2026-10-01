import {
	extractDiscoveryLimits,
	hasUsableDiscoveryDetails,
	mergeSimplePricing,
	parseLiveDiscoveryRows,
	renderSyncMarkdown,
	safePricingRules,
	simpleNonTokenPricing,
} from "./sync-provider-discovery";

describe("provider discovery catalog sync", () => {
	test.each(["second", "minute", undefined])("does not flatten OrcaRouter video %s prices into a request fee", (request_unit) => {
		expect(simpleNonTokenPricing("orcarouter", {
			pricing: { request: "0.08", request_unit },
		}, "video.generate")).toBeNull();
	});
	test("accepts only non-empty payload objects as usable discovery details", () => {
		expect(hasUsableDiscoveryDetails(null)).toBe(false);
		expect(hasUsableDiscoveryDetails(undefined)).toBe(false);
		expect(hasUsableDiscoveryDetails({})).toBe(false);
		expect(hasUsableDiscoveryDetails([])).toBe(false);
		expect(hasUsableDiscoveryDetails("pricing")).toBe(false);
		expect(hasUsableDiscoveryDetails(42)).toBe(false);
		expect(hasUsableDiscoveryDetails({ pricing: { input: 1 } })).toBe(true);
	});

	test("extracts nested provider limits", () => {
		expect(extractDiscoveryLimits({
			metadata: { context_length: 200_000, max_output_tokens: 16_384 },
		})).toEqual({ context: 200_000, output: 16_384 });
	});

	test("parses OpenAI-compatible live model payloads with provenance", () => {
		expect(parseLiveDiscoveryRows("vercel", {
			object: "list",
			data: [{ id: "openai/gpt-5", context_window: 400_000, pricing: { input: "0.000001" } }],
		}, "2026-08-11T00:00:00.000Z", "https://example.com/models")).toEqual([{
			provider_id: "vercel",
			model_id: "openai/gpt-5",
			model_details: { id: "openai/gpt-5", context_window: 400_000, pricing: { input: "0.000001" } },
			last_seen_at: "2026-08-11T00:00:00.000Z",
			source_url: "https://example.com/models",
		}]);
	});

	test("updates and adds meters only for simple standard pricing", () => {
		const pricing = {
			rules: [{
				meter: "input_text_tokens",
				pricing_plan: "standard",
				price_per_unit: 1,
				match: [],
				conditions: [],
				effective_to: null,
			}],
		};
		const result = mergeSimplePricing(pricing, {
			input_text_tokens: 2,
			output_text_tokens: 8,
		});
		expect(result.changed).toBe(true);
		expect(result.value.rules).toEqual(expect.arrayContaining([
			expect.objectContaining({ meter: "input_text_tokens", price_per_unit: 2 }),
			expect.objectContaining({ meter: "output_text_tokens", price_per_unit: 8 }),
		]));
	});

	test("rejects conditional pricing from automatic mutation", () => {
		expect(safePricingRules({
			rules: [{ pricing_plan: "standard", match: [{ path: "input_tokens", op: "gte", value: 200_000 }] }],
		})).toBe(false);
	});

	test("rejects multiple active rules for the same meter", () => {
		expect(safePricingRules({
			rules: [
				{ meter: "input_text_tokens", pricing_plan: "standard", match: [], conditions: [] },
				{ meter: "input_text_tokens", pricing_plan: "standard", match: [], conditions: [], priority: 90 },
			],
		})).toBe(false);
	});

	test("renders official differences with model, capability, meter, and provenance", () => {
		const markdown = renderSyncMarkdown({
			providers: 1,
			rows: 1,
			mappingsCreated: 0,
			mappingsUpdated: 0,
			pricingCreated: 0,
			pricingUpdated: 1,
			unmatched: [],
			skippedPricing: [],
			sourceErrors: [],
			changedFiles: [],
			officialPricing: {
				providers: [{
					provider: "fireworks",
					sourceUrl: "https://example.com/pricing",
					rowsParsed: 1,
					pricingCreated: 0,
					pricingUpdated: 1,
					unmatched: [],
					ambiguous: [],
					skippedComplex: [],
					changedFiles: [],
					comparisons: [{
						providerModel: "Example",
						apiModelId: "example/model",
						capabilityId: "text.generate",
						meter: "cached_read_text_tokens",
						officialPrice: 0.028,
						currentPrices: [0.03],
						status: "different",
					}],
				}],
				rowsParsed: 1,
				pricingCreated: 0,
				pricingUpdated: 1,
				unmatched: [],
				ambiguous: [],
				skippedComplex: [],
				changedFiles: [],
			},
		});
		expect(markdown).toContain("Official pricing providers checked: 1");
		expect(markdown).toContain("`fireworks`: https://example.com/pricing");
		expect(markdown).toContain("`fireworks` `example/model` `text.generate` `cached_read_text_tokens`");
		expect(markdown).toContain("official **$0.028/M**, current **$0.03/M** (different)");
	});
});
