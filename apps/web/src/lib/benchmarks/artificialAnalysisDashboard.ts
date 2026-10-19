import type { ArtificialAnalysisPublicData, ArtificialAnalysisPublicConfiguration } from "@/lib/fetchers/benchmarks/types";

export const dashboardBenchmarks: Record<string, string> = {
	terminalBench40: "Terminal-Bench 4.0", scicode: "SciCode", hle: "Humanity’s Last Exam", gpqa: "GPQA Diamond", omniscience: "AA-Omniscience", lcr: "AA-LCR", gdpval: "GDPval-AA", critpt: "CritPt", gdpPdfAllPass: "GDP.pdf", automationBenchPartialScore: "AutomationBench-AA", mmmuPro: "MMMU-Pro", livecodebench: "LiveCodeBench", aime25: "AIME 2025", ifbench: "IFBench", tau2: "τ²-Bench Telecom", tauBanking: "τ-Bench Banking", apexAgents: "APEX-Agents", terminalBench21: "Terminal-Bench 2.1",
};
export const effortOrder = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Keep direct chart labels apart without changing their data coordinates. */
export function dashboardLabelPositions(items: { id: string; y: number }[], top: number, bottom: number, gap = 20) {
	const sorted = [...items].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
	const spacing = sorted.length > 1 ? Math.min(gap, (bottom - top) / (sorted.length - 1)) : gap;
	const positions = sorted.map((item, index) => Math.max(item.y, index ? top + index * spacing : top));
	for (let index = 1; index < positions.length; index++) positions[index] = Math.max(positions[index], positions[index - 1] + spacing);
	if (positions.length) positions[positions.length - 1] = Math.min(positions.at(-1)!, bottom);
	for (let index = positions.length - 2; index >= 0; index--) positions[index] = Math.min(positions[index], positions[index + 1] - spacing);
	return new Map(sorted.map((item, index) => [item.id, positions[index]]));
}
export type DashboardRow = {
	id: string; modelId: string; modelName: string; sourceName: string; creatorId: string; colour: string | null; effort: string;
	intelligence: number | null; tokensPerTask: number | null; totalTokens: number | null; costPerTask: number | null; totalCost: number | null; timePerTask: number | null;
	benchmarks: Record<string, number | null>; capabilities: Record<string, number | null>;
};
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function dashboardRows(models: ArtificialAnalysisPublicConfiguration[]): DashboardRow[] {
	return models.map((model) => ({ id: model.id, modelId: model.model_id, modelName: model.name.replace(/\s*\((?:low|medium|high|xhigh|max|minimal|none|non-reasoning)[^)]*\)/gi, "").trim(), sourceName: model.name,
		creatorId: model.creator?.slug ?? model.model_id.split("/")[0], colour: model.creator?.color ?? null, effort: model.effort ?? "default",
		intelligence: model.intelligenceIndexIsEstimated ? null : finite(model.intelligenceIndex), tokensPerTask: finite(model.outputTokensPerTask?.output), totalTokens: finite(model.totalTokens?.output),
		costPerTask: finite(model.costPerTaskUsd?.total), totalCost: finite(model.totalCostUsd?.total), timePerTask: finite(model.timePerTaskSeconds),
		benchmarks: model.benchmarkScores ?? {}, capabilities: model.capabilityScores ?? {},
	}));
}

/** Keep pagination within one publication; never combine configurations from two snapshots. */
export async function loadDashboardData(fetchPage: (offset: number) => Promise<ArtificialAnalysisPublicData | null>): Promise<ArtificialAnalysisPublicData | null> {
	const first = await fetchPage(0);
	if (!first || first.total < 1 || first.total > 10000) return null;
	const offsets = Array.from({ length: Math.ceil(first.total / 200) - 1 }, (_, index) => (index + 1) * 200);
	const pages: ArtificialAnalysisPublicData[] = [first];
	// Bound in-flight requests even if the catalogue grows substantially.
	for (let start = 0; start < offsets.length; start += 4) {
		const batch = await Promise.all(offsets.slice(start, start + 4).map(fetchPage));
		if (batch.some((page) => !page || page.snapshot_id !== first.snapshot_id || page.total !== first.total || page.methodology_version !== first.methodology_version)) return null;
		pages.push(...batch as ArtificialAnalysisPublicData[]);
	}
	const models = pages.flatMap((page) => page.models);
	if (models.length !== first.total || new Set(models.map((model) => model.id)).size !== models.length) return null;
	return { ...first, models };
}

export function paretoPoints<T extends { x: number; y: number }>(points: T[]): T[] {
	let best = -Infinity;
	return [...points].sort((a, b) => a.x - b.x || b.y - a.y).filter((point) => {
		if (point.y <= best) return false;
		best = point.y; return true;
	});
}

export function dashboardLogTicks(values: number[]) {
	const positive = values.filter((value) => value > 0);
	if (!positive.length) return undefined;
	const min = Math.min(...positive), max = Math.max(...positive);
	const steps: number[] = [];
	for (let power = Math.floor(Math.log10(min)); power <= Math.ceil(Math.log10(max)); power++) for (const step of [1, 2, 5]) steps.push(Number((step * 10 ** power).toPrecision(1)));
	const lower = steps.filter((value) => value <= min).at(-1) ?? steps[0];
	const upper = steps.find((value) => value >= max) ?? steps.at(-1)!;
	const ticks = steps.filter((value) => value >= lower && value <= upper);
	return ticks.length > 1 ? ticks : undefined;
}
