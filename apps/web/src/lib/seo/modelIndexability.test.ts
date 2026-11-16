import { describe, it, expect } from "vitest";
import { analyseModelIndexability } from "./modelIndexability";

describe("modelIndexability", () => {
	it("allows model pages with identity and useful comparison data", () => {
		const analysis = analyseModelIndexability({
			modelId: "openai/gpt-5.5",
			name: "GPT-5.5",
			organisationName: "OpenAI",
			description:
				"GPT-5.5 is a flagship reasoning model with provider coverage, pricing, and benchmark tracking on Phaseo.",
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
			organisationName: "Phaseo",
			releaseDate: "2026-06-01",
			inputTypes: ["text"],
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.reasons).toContain("missing canonical model id");
	});

	it("noindexes retired, draft and disabled models even with rich data", () => {
		for (const status of ["retired", "draft", "disabled"]) {
			const analysis = analyseModelIndexability({
				modelId: "openai/gpt-2",
				name: "GPT-2",
				organisationName: "OpenAI",
				status,
				providerCount: 2,
				pricingRuleCount: 2,
				benchmarkCount: 3,
				releaseDate: "2019-02-14",
			});

			expect(analysis.indexable).toBe(false);
			expect(analysis.reasons).toContain(`${status} model`);
		}
	});

	it("keeps deprecated models that a provider still serves", () => {
		const analysis = analyseModelIndexability({
			modelId: "openai/gpt-4.1",
			name: "GPT-4.1",
			organisationName: "OpenAI",
			status: "deprecated",
			providerCount: 1,
			pricingRuleCount: 2,
			releaseDate: "2025-04-14",
		});

		expect(analysis.indexable).toBe(true);
	});

	it("noindexes catalogue-only models with no provider", () => {
		const analysis = analyseModelIndexability({
			modelId: "meta/llama-2-7b",
			name: "Llama 2 7B",
			organisationName: "Meta",
			status: "active",
			providerCount: 0,
			activeProviderCount: 0,
			benchmarkCount: 4,
			releaseDate: "2023-07-18",
			inputTypes: ["text"],
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.reasons).toContain("no provider serves this model");
	});

	it("noindexes models whose only provider routes are inactive or coming soon", () => {
		const analysis = analyseModelIndexability({
			modelId: "acme/rich-model",
			name: "Rich Model",
			organisationName: "Acme",
			status: "active",
			description: "Rich Model is a well documented model with pricing, benchmarks and a release date on Phaseo.",
			providerCount: 1,
			activeProviderCount: 0,
			pricingRuleCount: 2,
			benchmarkCount: 3,
			releaseDate: "2026-06-01",
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.reasons).toContain("no provider serves this model");
	});

	it("skips the provider gate when provider data is unavailable", () => {
		const analysis = analyseModelIndexability({
			modelId: "openai/gpt-5.5",
			name: "GPT-5.5",
			organisationName: "OpenAI",
			status: "active",
			benchmarkCount: 2,
			releaseDate: "2026-06-01",
			inputTypes: ["text"],
		});

		expect(analysis.indexable).toBe(true);
	});

	it("does not treat a catalogue update timestamp as useful page content", () => {
		const analysis = analyseModelIndexability({
			modelId: "qwen/qwen3-8b",
			name: "Qwen 3 8B",
			organisationName: "Qwen",
			updatedAt: "2026-08-31T00:00:00Z",
		});

		expect(analysis.indexable).toBe(false);
		expect(analysis.signals.hasReleaseDate).toBe(false);
	});
});
