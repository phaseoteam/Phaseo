import type { ArtificialAnalysisPublicData, ArtificialAnalysisPublicConfiguration } from "@/lib/fetchers/benchmarks/types";
import { MONEY_LOCALE } from "@/lib/displayPreferences";

export const dashboardBenchmarks: Record<string, string> = {
	terminalBench40: "Terminal-Bench 4.0", scicode: "SciCode", hle: "Humanity’s Last Exam", gpqa: "GPQA Diamond", omniscience: "AA-Omniscience", lcr: "AA-LCR", gdpval: "GDPval-AA", critpt: "CritPt", gdpPdfAllPass: "GDP.pdf", automationBenchPartialScore: "AutomationBench-AA", mmmuPro: "MMMU-Pro", livecodebench: "LiveCodeBench", aime25: "AIME 2025", ifbench: "IFBench", tau2: "τ²-Bench Telecom", tauBanking: "τ-Bench Banking", apexAgents: "APEX-Agents", terminalBench21: "Terminal-Bench 2.1",
};
export const effortOrder = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];

export function dashboardLinearTicks(values: number[]) {
	const finite = values.filter(Number.isFinite);
	const min = finite.length ? Math.min(...finite) : 0, max = finite.length ? Math.max(...finite) : 1;
	const padding = Math.max((max - min) * 0.05, max === min ? Math.abs(max) * 0.1 || 1 : 0);
	const lower = min >= 0 ? Math.max(0, min - padding) : min - padding;
	const upper = max + padding;
	const raw = (upper - lower) / 5;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = ([1, 2, 5, 10].find((factor) => factor * power >= raw) ?? 10) * power;
	const start = Math.floor(lower / step), end = Math.ceil(upper / step);
	return Array.from({ length: end - start + 1 }, (_, index) => Number(((start + index) * step).toPrecision(12)));
}

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
	isOpenWeights?: boolean; deprecated?: boolean; sourceSlug?: string;
	benchmarks: Record<string, number | null>; capabilities: Record<string, number | null>;
};

/** Give every published configuration its own slot, including repeated effort levels. */
export function dashboardModelGroups(rows: DashboardRow[], value: (row: DashboardRow) => number | null, lowerIsBetter: boolean) {
	const groups = new Map<string, { row: DashboardRow; value: number }[]>();
	for (const row of rows) {
		const metric = value(row);
		if (metric === null || !Number.isFinite(metric)) continue;
		const group = groups.get(row.modelId) ?? [];
		group.push({ row, value: metric });
		groups.set(row.modelId, group);
	}
	return [...groups].map(([id, configurations]) => ({ id, configurations: configurations.sort((a, b) => effortOrder.indexOf(a.row.effort) - effortOrder.indexOf(b.row.effort) || a.row.sourceName.localeCompare(b.row.sourceName) || a.row.id.localeCompare(b.row.id)), maximum: Math.max(...configurations.map((configuration) => configuration.value)) }))
		.sort((a, b) => (lowerIsBetter ? a.maximum - b.maximum : b.maximum - a.maximum) || a.id.localeCompare(b.id));
}
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function dashboardRows(models: ArtificialAnalysisPublicConfiguration[]): DashboardRow[] {
	return models.map((model) => ({ id: model.id, modelId: model.model_id, modelName: model.name.replace(/\s*\((?:low|medium|high|xhigh|max|minimal|none|non-reasoning)[^)]*\)/gi, "").trim(), sourceName: model.name,
		creatorId: model.creator?.slug ?? model.model_id.split("/")[0], colour: model.creator?.color ?? null, effort: model.effort ?? (/non-reasoning/i.test(model.name) ? "none" : "default"),
		intelligence: model.intelligenceIndexIsEstimated ? null : finite(model.intelligenceIndex), tokensPerTask: finite(model.outputTokensPerTask?.output), totalTokens: finite(model.totalTokens?.output),
		costPerTask: finite(model.costPerTaskUsd?.total), totalCost: finite(model.totalCostUsd?.total), timePerTask: finite(model.timePerTaskSeconds),
		isOpenWeights: model.modelDetails?.isOpenWeights === true, deprecated: model.modelDetails?.deprecated === true, sourceSlug: model.slug,
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

/** Use only the precision needed to distinguish adjacent unequal axis ticks. */
export function dashboardTickPrecision(values: number[], format: (value: number, digits: number) => string) {
	for (let digits = 3; digits < 12; digits++) {
		if (values.every((value, index) => !index || value === values[index - 1] || format(value, digits) !== format(values[index - 1], digits))) return digits;
	}
	return 12;
}

/** Preserve sub-cent costs while keeping plotted currency labels short. */
export function formatDashboardCost(value: number, locale: string, compact = false, precision = 4) {
 return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumSignificantDigits: precision, ...(compact && Math.abs(value) >= 1000 ? { notation: "compact" } : {}) }).format(value);
}

/** Prioritise group maxima, then retain only value labels whose padded bounds do not overlap. */
export function dashboardVisibleValueLabels(items: { id: string; x: number; y: number; label: string; priority: boolean }[], left: number, right: number) {
 const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
 const visible = new Set<string>();
 for (const item of [...items].sort((a, b) => Number(b.priority) - Number(a.priority) || a.y - b.y || a.id.localeCompare(b.id))) {
 const halfWidth = item.label.length * 3.25 + 4;
 const box = { left: item.x - halfWidth, right: item.x + halfWidth, top: item.y - 12, bottom: item.y + 4 };
 if (box.left < left || box.right > right || occupied.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
 occupied.push(box); visible.add(item.id);
 }
 return visible;
}
