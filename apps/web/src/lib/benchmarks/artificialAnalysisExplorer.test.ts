import { it, expect } from "vitest";
import { buildArtificialAnalysisExplorer } from "./artificialAnalysisExplorer";
import { buildArtificialAnalysisRanking } from "./artificialAnalysis";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

const ranking = (metric: string, score: number, source = "source-high", variant = "high", fetched = "2026-10-18T00:00:00Z") => buildArtificialAnalysisRanking({
	id: `aa-${metric}-v4`, name: metric, category: null, ascending_order: true, total_models: 1, link: null,
	results: [{ id: `${metric}-${source}`, model_id: "lab/model", model: { model_id: "lab/model", name: "Model" }, score, variant,
		is_self_reported: false, other_info: `Artificial Analysis ID ${source}; Intelligence Index v4.3.2`, updated_at: fetched }],
} satisfies BenchmarkPage);

it("retains every evaluated configuration and joins matching scores and costs", () => {
	const intelligence = ranking("intelligence-index", 50);
	const low = ranking("intelligence-index", 40, "source-low", "low");
	intelligence.entries[0].configurations!.push(...low.entries[0].configurations!);
	const points = buildArtificialAnalysisExplorer([intelligence, ranking("intelligence-index-cost", 0)]);
	expect(points).toHaveLength(2);
	expect(points.find((point) => point.variant === "high")).toMatchObject({ intelligence: 50, cost: 0 });
	expect(points.find((point) => point.variant === "low")).not.toHaveProperty("cost");
});

it("does not combine different source configurations or fetch timestamps", () => {
	const points = buildArtificialAnalysisExplorer([
		ranking("intelligence-index", 50),
		ranking("intelligence-index-cost", 20, "source-low", "low"),
		ranking("intelligence-index-cost", 30, "source-high", "high", "2026-10-19T00:00:00Z"),
	]);
	expect(points).toHaveLength(3);
	expect(points.filter((point) => point.intelligence !== undefined && point.cost !== undefined)).toHaveLength(0);
});

it("rejects conflicting duplicate metrics and does not join unidentified legacy scores", () => {
	const first = ranking("intelligence-index", 50);
	expect(buildArtificialAnalysisExplorer([first, ranking("intelligence-index", 51)])).toHaveLength(0);
	const cost = ranking("intelligence-index-cost", 20);
	for (const entry of [...first.entries, ...cost.entries]) entry.configurations![0].other_info = "Intelligence Index v4.3.2";
	expect(buildArtificialAnalysisExplorer([first, cost])).toHaveLength(2);
});
