import { describe, expect, it } from "vitest";
import { mapDirectoryRows, mapProfileRows } from "./reader";

describe("mapDirectoryRows", () => {
	it("keeps benchmarks with models, prefers the source's last sync for freshness and drops empty fields", () => {
		const rows = mapDirectoryRows([
			{ benchmark_id: "lmarena-text", name: "LMArena Text", category: "general", unit: "Elo", benchmark_type: "numerical", higher_is_better: true, source_id: "lmarena", source_name: "LMArena", source_publisher: "LMArena", source_last_success_at: "2026-11-26T05:17:00Z", model_count: "212", result_count: 240, independent_count: 240, latest_observed_on: "2026-11-22", latest_updated_at: null },
			{ benchmark_id: "old", name: "Old", model_count: 3, result_count: 3, independent_count: 0, latest_observed_on: null, latest_updated_at: "2025-01-02T00:00:00Z", higher_is_better: false },
			{ benchmark_id: "empty", name: "Empty", model_count: 0 },
		]);
		expect(rows).toEqual([
			{ id: "lmarena-text", name: "LMArena Text", category: "general", unit: "Elo", type: "numerical", higherIsBetter: true, sourceId: "lmarena", sourceName: "LMArena", publisher: "LMArena", models: 212, results: 240, independent: 240, updatedAt: "2026-11-26T05:17:00.000Z" },
			{ id: "old", name: "Old", higherIsBetter: false, models: 3, results: 3, independent: 0, updatedAt: "2025-01-02T00:00:00.000Z" },
		]);
	});
});

describe("mapProfileRows", () => {
	it("maps numeric strings and keeps rank, effort and source attribution", () => {
		const [row] = mapProfileRows([{
			result_id: "r1", benchmark_id: "gpqa-diamond-vals", benchmark_name: "GPQA Diamond (Vals)", category: "science", unit: "%", benchmark_type: "percentage", higher_is_better: true,
			comparable_score: "0.76", score: "0.76", is_self_reported: false, source_id: "vals-gpqa", source_name: "Vals AI", source_publisher: "Vals AI", source_attribution: "Data from Vals AI",
			effort: "high", harness: null, config: "", ci_low: "0.5", cost_usd: 0.08, output_tokens: "6606.5", observed_on: "2026-09-01", model_rank: "12", ranked_models: 138,
		}]);
		expect(row).toMatchObject({ id: "r1", score: 0.76, selfReported: false, effort: "high", ciLow: 0.5, costUsd: 0.08, outputTokens: 6606.5, rank: 12, rankedModels: 138, attribution: "Data from Vals AI" });
		expect(row).not.toHaveProperty("harness");
		expect(row).not.toHaveProperty("config");
	});
});
