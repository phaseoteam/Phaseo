import { dashboardRows, loadDashboardData, paretoPoints } from "./artificialAnalysisDashboard";
import type { ArtificialAnalysisPublicConfiguration, ArtificialAnalysisPublicData } from "@/lib/fetchers/benchmarks/types";

const model = (id: string): ArtificialAnalysisPublicConfiguration => ({ id, model_id: "lab/model", name: "Model (High)", slug: "model-high", creator: null, effort: "high", intelligenceIndex: 50, intelligenceIndexIsEstimated: false, totalTokens: { output: 0 }, outputTokensPerTask: null, totalCostUsd: null, costPerTaskUsd: { total: 0.005 }, timePerTaskSeconds: null, benchmarkScores: { omniscience: -3 }, capabilityScores: null, modelDetails: {}, pricing: {}, performance: {}, breakdowns: {}, evaluations: [] });
const page = (models: ArtificialAnalysisPublicConfiguration[], total = models.length, snapshot = "same") => ({ models, total, snapshot_id: snapshot, methodology_version: "4.3.2" } as ArtificialAnalysisPublicData);

it("retains zero, negative scores, configuration identity and task/total distinctions in a slim payload", () => {
	const row = dashboardRows([model("one")])[0];
	expect(row.totalTokens).toBe(0);
	expect(row.tokensPerTask).toBeNull();
	expect(row.costPerTask).toBe(0.005);
	expect(row.totalCost).toBeNull();
	expect(row.benchmarks.omniscience).toBe(-3);
	expect(row.modelName).toBe("Model");
	expect(row.sourceName).toBe("Model (High)");
	expect(dashboardRows([{ ...model("dated"), name: "Model (0902)" }])[0].modelName).toBe("Model (0902)");
	expect(row).not.toHaveProperty("sourceData");
	expect(dashboardRows([{ ...model("estimate"), intelligenceIndexIsEstimated: true }])[0].intelligence).toBeNull();
});
it("loads all configurations with bounded pages from a single publication", async () => {
	const first = Array.from({ length: 200 }, (_, i) => model(String(i)));
	const fetch = jest.fn(async (offset: number) => offset ? page([model("last")], 201) : page(first, 201));
	expect((await loadDashboardData(fetch))?.models).toHaveLength(201);
	expect(fetch.mock.calls.map(([offset]) => offset)).toEqual([0, 200]);
});
it("rejects mixed publications, duplicates and incomplete pages", async () => {
	const first = Array.from({ length: 200 }, (_, i) => model(String(i)));
	for (const last of [page([model("last")], 201, "new"), page([model("0")], 201), page([], 201)]) {
		expect(await loadDashboardData(async (offset) => offset ? last : page(first, 201))).toBeNull();
	}
});
it("computes the lower-cost higher-score frontier without inventing configurations", () => {
	const points = [{ x: 2, y: 4 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 1 }, { x: 0, y: 0 }];
	expect(paretoPoints(points)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }]);
	expect(points[0]).toEqual({ x: 2, y: 4 });
});
