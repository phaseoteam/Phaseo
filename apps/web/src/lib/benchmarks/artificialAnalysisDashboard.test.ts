import { dashboardTickPrecision } from "./artificialAnalysisDashboard";
import { dashboardLabelPositions, dashboardLinearTicks, dashboardModelGroups, dashboardRows, loadDashboardData, paretoPoints } from "./artificialAnalysisDashboard";
import type { ArtificialAnalysisPublicConfiguration, ArtificialAnalysisPublicData } from "@/lib/fetchers/benchmarks/types";

const model = (id: string): ArtificialAnalysisPublicConfiguration => ({ id, model_id: "lab/model", name: "Model (High)", slug: "model-high", creator: null, effort: "high", intelligenceIndex: 50, intelligenceIndexIsEstimated: false, totalTokens: { output: 0 }, outputTokensPerTask: null, totalCostUsd: null, costPerTaskUsd: { total: 0.005 }, timePerTaskSeconds: null, benchmarkScores: { omniscience: -3 }, capabilityScores: null, modelDetails: {}, pricing: {}, performance: {}, breakdowns: {}, evaluations: [] });
const page = (models: ArtificialAnalysisPublicConfiguration[], total = models.length, snapshot = "same") => ({ models, total, snapshot_id: snapshot, methodology_version: "4.3.2" } as ArtificialAnalysisPublicData);

it("uses readable ticks without clipping zero, negative scores or tiny costs", () => {
	expect(dashboardLinearTicks([34, 58])).toEqual([30, 40, 50, 60]);
	for (const values of [[0], [-3, 4], [0.00001, 0.00002], []]) {
		const ticks = dashboardLinearTicks(values);
		expect(ticks.length).toBeGreaterThan(1);
		expect(ticks.every(Number.isFinite)).toBe(true);
		for (const value of values) { expect(ticks[0]).toBeLessThanOrEqual(value); expect(ticks.at(-1)).toBeGreaterThanOrEqual(value); }
	}
});

it("keeps clustered endpoint labels apart and inside the plot without moving their points", () => {
	const points = [{ id: "a", y: 10 }, { id: "b", y: 11 }, { id: "c", y: 1000 }];
	const positions = [...dashboardLabelPositions(points, 20, 100).values()];
	expect(positions[0]).toBeGreaterThanOrEqual(20);
	expect(positions.at(-1)).toBeLessThanOrEqual(100);
	expect(positions[1] - positions[0]).toBeGreaterThanOrEqual(20);
	expect(positions[2] - positions[1]).toBeGreaterThanOrEqual(20);
	expect(points[2].y).toBe(1000);
});

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

it("keeps every configuration in its model group, including duplicate effort levels", () => {
	const base = dashboardRows([model("one")])[0];
	const rows = [{ ...base, id: "max", effort: "max", totalTokens: 100 }, { ...base, id: "high-b", effort: "high", totalTokens: 50 }, { ...base, id: "high-a", effort: "high", totalTokens: 40 }, { ...base, id: "other", modelId: "lab/other", totalTokens: 10 }, { ...base, id: "missing", totalTokens: null }];
	const groups = dashboardModelGroups(rows, (row) => row.totalTokens, true);
	expect(groups.map((group) => group.id)).toEqual(["lab/other", "lab/model"]);
	expect(groups[1].configurations.map((item) => item.row.id)).toEqual(["high-a", "high-b", "max"]);
	expect(groups[1].configurations.map((item) => item.value)).toEqual([40, 50, 100]);
	expect(rows[0].id).toBe("max");
});

it("keeps zero/negative grouped values, excludes nonfinite data, and sorts score groups high first", () => {
	const base = dashboardRows([model("one")])[0];
	const rows = [{ ...base, id: "zero", totalTokens: 0 }, { ...base, id: "negative", totalTokens: -2 }, { ...base, id: "positive", modelId: "lab/other", totalTokens: 2 }, { ...base, id: "invalid", totalTokens: Infinity }];
	const groups = dashboardModelGroups(rows, (row) => row.totalTokens, false);
	expect(groups[0].id).toBe("lab/other");
	expect(groups[1].configurations.map((item) => item.value).sort()).toEqual([-2, 0]);
	expect(dashboardModelGroups([], (row) => row.totalTokens, true)).toEqual([]);
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

it("increases tick precision only until adjacent unequal values are distinct", () => {
	const format = (value: number, digits: number) => new Intl.NumberFormat("en-GB", { maximumSignificantDigits: digits }).format(value);
	expect(dashboardTickPrecision([50.123, 50.124, 50.125], format)).toBe(5);
	expect(dashboardTickPrecision([10, 10, 20, 10], format)).toBe(3);
	expect(dashboardTickPrecision([-0.0000123, 0, 0.0000123], format)).toBe(3);
});
