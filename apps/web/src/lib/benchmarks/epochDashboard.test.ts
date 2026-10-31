import { it, expect } from "vitest";
import { buildEpochDashboard, epochCsv, epochFrontier, epochNumber, fitEpochDomain, type EpochDashboardRow } from "./epochDashboard";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

const benchmark: BenchmarkPage = { id: "epoch-capabilities-index", name: null, category: null, ascending_order: true, total_models: 1, link: null, results: [{ id: "result", model_id: "lab/a", result_key: "lab/a:epoch-capabilities-index:A", score: 150, is_self_reported: false, model: { model_id: "lab/a", name: "Canonical" } }] };
const scores = "Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Accessibility group\nA,A high,150,148,152,2025-01-01,Lab,Open weights\nB,B low,0,-2,2,2025-01-02,Lab,Closed weights\nC,C,-10,,,2025-02-01,,Other\nD,D,,,,2025-02-02,,Other";

it("parses quoted source identities and final CSV rows without turning blanks into zero", () => {
	expect(epochCsv('Model,eci\n"A, \"\"high\"\"",0')).toEqual([{ Model: 'A, "high"', eci: "0" }]);
	expect(epochNumber("")).toBeNull(); expect(epochNumber(null)).toBeNull(); expect(epochNumber("-2")).toBe(-2); expect(epochNumber("0")).toBe(0);
	expect(() => epochCsv('Model\n"incomplete')).toThrow();
});
it("keeps all source identities, signed scores and only unambiguous catalogue links", () => {
	const rows = buildEpochDashboard(scores, null, null, null, benchmark);
	expect(rows).toHaveLength(3);
	expect(rows[0]).toMatchObject({ id: "A", modelId: "lab/a", access: "open", interval: { low: 148, high: 152 } });
	expect(rows[1]).toMatchObject({ modelId: null, scores: { overall: 0 }, interval: { low: -2, high: 2 } });
	expect(rows[2].scores.coding).toBeNull();
	expect(() => buildEpochDashboard(scores + "\nA,A,140,,,,,", null, null, null, benchmark)).toThrow("Duplicate");
});
it("requires two domain benchmarks and recovers a known logistic capability", () => {
	const actual = -12.5;
	const observations = [-40, 0, 30].map((difficulty) => ({ difficulty, slope: 0.04, performance: 1 / (1 + Math.exp(-0.04 * (actual - difficulty))) }));
	expect(fitEpochDomain(observations)).toBeCloseTo(actual, 5);
	expect(fitEpochDomain(observations.slice(0, 1))).toBeNull();
	expect(fitEpochDomain([{ ...observations[0], slope: -1 }, observations[1]])).toBeNull();
});
it("reproduces Epoch's best-observation aggregation and domain matching without general CIs", () => {
	const observations = "model,benchmark,performance\nA,Code One,0.5\nA,Code One,0.2\nA,Code Two,0.5\nB,Code One,0.5";
	const parameters = "benchmark_name,edi,estimated_slope_scaled\nCode One,150,0.05\nCode Two,150,0.1";
	const definitions = { one: { id: "Code One", domains: ["Software engineering"] }, two: { title: "Code Two", domains: ["Software engineering"] } };
	const rows = buildEpochDashboard(scores, observations, parameters, definitions, benchmark);
	expect(rows[0].scores.coding).toBeCloseTo(150, 5);
	expect(rows[0].counts).toEqual({ coding: 2, maths: 0 });
	expect(rows[1].scores.coding).toBeNull();
});
it("builds a monotonic frontier, taking only the best score per day and ignoring undated models", () => {
	const rows = buildEpochDashboard(scores, null, null, null, benchmark);
	const row = (id: string, date: string | null, score: number): EpochDashboardRow => ({ ...rows[0], id, date, scores: { overall: score, coding: null, maths: null } });
	expect(epochFrontier([row("b", "2025-01-01", 0), row("a", "2024-01-01", -5), row("c", "2025-01-01", 5), row("d", "2026-01-01", 4), row("missing", null, 100)]).map((r) => r.id)).toEqual(["a", "c"]);
});
