import { describe, expect, it } from "vitest";
import { buildCatalogPricingIssueEntries, buildPricingTableIssueEntries, buildProviderPricingIssueEntries } from "./github-issues";

describe("pricing issue entries", () => {
	it("turns provider API price diffs into a deduplicable pricing signal", () => {
		expect(
			buildProviderPricingIssueEntries({
				changes: [{ providerId: "groq", providerName: "Groq", samples: ["llama-3.3 | price: old -> new"] }],
				detectedAt: "2026-07-11T00:00:00Z",
				detectionSource: "scheduled",
			}),
		).toEqual([
			{
				source: "provider-pricing-api",
				providerId: "groq",
				providerName: "Groq",
				action: "change",
				modelId: "llama-3.3",
				detectedAt: "2026-07-11T00:00:00Z",
				detectionSource: "scheduled",
				reason: "price: old -> new",
			},
		]);
	});

	it("links table watcher issues to the authoritative pricing page", () => {
		const [entry] = buildPricingTableIssueEntries({
			changes: [{ providerId: "groq", providerName: "Groq", sourceUrl: "https://example.com/pricing", tableCount: 2, pricingSamples: ["grok-4 | $2 / 1M input tokens"] }],
			detectedAt: "2026-07-11T00:00:00Z",
			detectionSource: "scheduled",
		});

		expect(entry).toMatchObject({
			source: "provider-pricing-table",
			action: "change",
			modelUrl: "https://example.com/pricing",
			reason: "2 price-bearing tables changed. Current source samples: grok-4 | $2 / 1M input tokens",
		});
	});

	it("turns catalogue pricing-rule samples into detailed GitHub signals", () => {
		expect(buildCatalogPricingIssueEntries({
			changes: [{ providerId: "groq", providerName: "Groq", samples: ["llama-3.3 | text.generate | input: 0.5 -> 0.3 USD / 1M tokens"] }],
			detectedAt: "2026-07-12T00:00:00Z",
			detectionSource: "scheduled",
		})).toEqual([
			{
				source: "catalog-pricing",
				providerId: "groq",
				providerName: "Groq",
				action: "change",
				modelId: "llama-3.3",
				detectedAt: "2026-07-12T00:00:00Z",
				detectionSource: "scheduled",
				reason: "text.generate | input: 0.5 -> 0.3 USD / 1M tokens",
			},
		]);
	});
});
