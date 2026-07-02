import { analyseModelIndexability } from "./modelIndexability";

describe("modelIndexability", () => {
	it("allows model pages with identity and useful comparison data", () => {
		const analysis = analyseModelIndexability({
			modelId: "openai/gpt-5.5",
			name: "GPT-5.5",
			organisationName: "OpenAI",
			description:
				"GPT-5.5 is a flagship reasoning model with provider coverage, pricing, and benchmark tracking on AI Stats.",
			apiModelIds: ["gpt-5.5"],
			providerCount: 3,
			pricingRuleCount: 4,
			benchmarkCount: 2,
			releaseDate: "2026-06-01",
		});

		expect(analysis.indexable).toBe(true);
		expect(analysis.reasons).toEqual([]);
	});

	it("noindexes thin generated pages with no dates, providers, pricing, benchmarks, or api identifiers", () => {
		const analysis = analyseModelIndexability({
			modelId: "unknown/model",
			name: "Unknown Model",
			organisationName: "Unknown",
			description: "Unknown Model is an AI model from Unknown.",
			providerCount: 0,
			activeProviderCount: 0,
			benchmarkCount: 0,
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.reasons).toContain(
			"missing pricing, providers, benchmarks, dates, and capability metadata",
		);
	});

	it("noindexes malformed generated routes", () => {
		const analysis = analyseModelIndexability({
			modelId: "orphan-slug",
			name: "Orphan Slug",
			organisationName: "AI Stats",
			releaseDate: "2026-06-01",
			inputTypes: ["text"],
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.reasons).toContain("missing canonical model id");
	});
});
