import { describe, expect, it } from "vitest";
import {
	deepSeekToolCharge,
	exaAgentCharge,
	exaContentsCharge,
	exaSearchCharge,
	parallelExtractCharge,
	parallelSearchCharge,
	parallelTaskCharge,
	perplexitySearchCharge,
	searchChargesToPricing,
} from "./search-pricing";

// Expected figures are each provider's published price (read 2026-11-16), in nanos ($1 = 1e9).
describe("managed search prices", () => {
	it.each([
		["lite", 1, 1, 4_000_000 + 1_000_000],
		["auto", 10, 1, 7_000_000 + 10_000_000],
		["deep-lite", 5, 2, 12_000_000 + 10_000_000],
		["deep", 12, 1, 12_000_000 + 2_000_000 + 12_000_000],
	])("prices an Exa %s search with %i results and %i content types at Exa's list price", (mode, results, contentTypes, nanos) => {
		expect(exaSearchCharge({ mode, results, contentTypes })).toEqual({ kind: "search", engine: "exa", mode, nanos, source: "list_price" });
	});

	it("uses the cost Exa reports for the call over its list price", () => {
		expect(exaSearchCharge({ mode: "deep", results: 10, contentTypes: 2, costDollars: { total: 0.0123 } }))
			.toMatchObject({ nanos: 12_300_000, source: "provider_reported" });
		expect(exaAgentCharge("agent-low", { total: 0.025 })).toMatchObject({ nanos: 25_000_000, source: "provider_reported" });
		expect(exaContentsCharge(1, { total: 0.001 })).toMatchObject({ nanos: 1_000_000, source: "provider_reported" });
	});

	it.each([undefined, {}, { total: -1 }, { total: "0.01" }, { total: Number.NaN }])(
		"falls back to the list price when Exa's reported cost is %o",
		(costDollars) => {
			expect(exaSearchCharge({ mode: "auto", results: 1, contentTypes: 1, costDollars })).toMatchObject({ nanos: 8_000_000, source: "list_price" });
		},
	);

	it("prices Exa Agent fixed efforts and contents", () => {
		expect(exaAgentCharge("agent-minimal").nanos).toBe(12_000_000);
		expect(exaAgentCharge("agent-low").nanos).toBe(25_000_000);
		expect(exaContentsCharge(1).nanos).toBe(1_000_000);
	});

	it.each([
		["turbo", 10, 1_000_000],
		["fast", 3, 1_000_000],
		["basic", 10, 5_000_000],
		["advanced", 15, 5_000_000 + 5_000_000],
	])("prices a Parallel %s search returning %i results", (mode, results, nanos) => {
		expect(parallelSearchCharge(mode, results).nanos).toBe(nanos);
	});

	it("prices Parallel Task runs and Extract", () => {
		expect(parallelTaskCharge("task-lite").nanos).toBe(5_000_000);
		expect(parallelTaskCharge("task-base").nanos).toBe(10_000_000);
		expect(parallelExtractCharge(1).nanos).toBe(1_000_000);
	});

	it("prices Perplexity standard and fast search, and DeepSeek search and fetch", () => {
		expect(perplexitySearchCharge("standard").nanos).toBe(5_000_000);
		expect(perplexitySearchCharge("fast").nanos).toBe(1_000_000);
		expect(deepSeekToolCharge("search").nanos).toBe(750_000);
		expect(deepSeekToolCharge("fetch")).toMatchObject({ kind: "fetch", nanos: 750_000 });
	});

	it("sums a round's charges into one gateway-funded charge with a line per call", () => {
		const pricing = searchChargesToPricing([
			perplexitySearchCharge("fast"),
			deepSeekToolCharge("fetch"),
			{ kind: "search", engine: "exa", mode: "auto", nanos: 0, source: "list_price" },
		]);
		expect(pricing).toMatchObject({ component: "web_search", provider: "multiple", total_nanos: 1_750_000, key_source: "gateway" });
		expect(pricing?.lines).toEqual([
			expect.objectContaining({ dimension: "server_tool_web_search_requests", engine: "perplexity", mode: "fast", line_nanos: 1_000_000 }),
			expect.objectContaining({ dimension: "server_tool_web_fetch_requests", engine: "deepseek", line_nanos: 750_000 }),
		]);
		expect(searchChargesToPricing([])).toBeNull();
	});
});
