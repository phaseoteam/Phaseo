import type {
	CompareEffort,
	ComparePriceKind,
	CompareViewBenchmark,
	CompareViewBenchmarkResult,
	CompareViewModel,
	CompareViewPriceRow,
	CompareViewUsageByModel,
} from "./types";

export const TIER_ORDER = ["standard", "batch", "flex", "priority"];
export const EFFORT_ORDER: CompareEffort[] = ["minimal", "low", "medium", "high", "xhigh", "max"];
export const ECI_BENCHMARK_ID = "epoch-capabilities-index";

export type Direction = "higher" | "lower";

/** "$1.25", "$0.125", "$0.0625", "$10.00": compare always shows US dollars. */
export function formatUsd(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: value >= 1000 ? 0 : 2,
		maximumFractionDigits: value >= 1000 ? 0 : 4,
	}).format(value);
}

export function sortTiers(tiers: Iterable<string>): string[] {
	const rank = (tier: string) => {
		const index = TIER_ORDER.indexOf(tier);
		return index === -1 ? TIER_ORDER.length : index;
	};
	return [...new Set(tiers)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * One base row per meter for a tier: the unconditional row when there is one,
 * otherwise the first conditional row (the API lists a meter's base band first,
 * e.g. "input tokens ≤ 272K"). Surcharge bands stay on the model page.
 */
export function tierRows(model: CompareViewModel, tier: string): CompareViewPriceRow[] | null {
	const rows = model.pricing?.tiers[tier];
	if (!rows) return null;
	const byMeter = new Map<string, CompareViewPriceRow[]>();
	for (const row of rows) byMeter.set(row.meter, [...(byMeter.get(row.meter) ?? []), row]);
	return [...byMeter.values()].map((group) => group.find((row) => !row.conditional) ?? group[0]!);
}

/** Conditional bands left out of the base rows, for a "see the model page" note. */
export function hiddenConditionalRows(model: CompareViewModel, tier: string): number {
	const rows = model.pricing?.tiers[tier] ?? [];
	return rows.length - (tierRows(model, tier)?.length ?? 0);
}

/**
 * The cheapest row of a kind. A model with no plain input or output row (a
 * voice model priced per character, an image model priced per image token)
 * falls back to its own input_* or output_* meter.
 */
export function priceRow(model: CompareViewModel, kind: ComparePriceKind, tier = "standard"): CompareViewPriceRow | null {
	const rows = tierRows(model, tier) ?? [];
	const cheapest = (candidates: CompareViewPriceRow[]) =>
		candidates.reduce<CompareViewPriceRow | null>((best, row) => (!best || row.price < best.price ? row : best), null);
	const direct = cheapest(rows.filter((row) => row.kind === kind));
	if (direct || (kind !== "input" && kind !== "output")) return direct;
	return cheapest(rows.filter((row) => row.kind === "other" && row.meter.startsWith(`${kind}_`) && !row.meter.includes("reasoning")));
}

/** USD per million tokens for a token-priced kind, or null when the model isn't priced per token. */
export function tokenPrice(model: CompareViewModel, kind: ComparePriceKind, tier = "standard"): number | null {
	const row = priceRow(model, kind, tier);
	if (!row || row.unit !== "token") return null;
	return (row.price / row.per) * 1_000_000;
}

export type Workload = { inputTokens: number; outputTokens: number; cachedShare: number };

/** USD for one request, with the cached share of input billed at the cache-read rate when there is one. */
export function requestCost(model: CompareViewModel, workload: Workload): number | null {
	const input = tokenPrice(model, "input");
	const output = tokenPrice(model, "output");
	if (input == null || output == null) return null;
	const cacheRead = tokenPrice(model, "cacheRead") ?? input;
	const share = Math.min(1, Math.max(0, workload.cachedShare));
	return (
		(workload.inputTokens * (1 - share) * input +
			workload.inputTokens * share * cacheRead +
			workload.outputTokens * output) /
		1_000_000
	);
}

export const TYPICAL_REQUEST: Workload = { inputTokens: 2000, outputTokens: 500, cachedShare: 0 };

/**
 * Indices holding the best value in a row. Nothing is best when fewer than two
 * models have a value or every model ties: a highlight should mean something.
 */
export function bestIndices(values: Array<number | null | undefined>, direction: Direction): Set<number> {
	const present = values
		.map((value, index) => ({ value, index }))
		.filter((entry): entry is { value: number; index: number } => entry.value != null && Number.isFinite(entry.value));
	if (present.length < 2) return new Set();
	const target = direction === "higher"
		? Math.max(...present.map((entry) => entry.value))
		: Math.min(...present.map((entry) => entry.value));
	const winners = present.filter((entry) => entry.value === target).map((entry) => entry.index);
	return winners.length === values.length ? new Set() : new Set(winners);
}

/** Models that share no output type do different jobs, so there's no "best" across them. */
export function doSameJob(models: CompareViewModel[]): boolean {
	const typed = models.filter((model) => model.outputTypes.length > 0);
	if (typed.length < 2) return true;
	return typed[0]!.outputTypes.some((type) => typed.every((model) => model.outputTypes.includes(type)));
}

/** Catalogue dates often lack a zone ("2024-10-01T00:00:00"); read them as UTC so months don't shift. */
export function asUtc(value: string): string {
	return /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? `${value}Z` : value;
}

export function timeValue(value: string | null): number | null {
	if (!value) return null;
	const time = Date.parse(asUtc(value));
	return Number.isFinite(time) ? time : null;
}

// Benchmarks

/** Only these evaluators run one model at several effort levels with the same harness. */
export function matchesEffort(benchmark: CompareViewBenchmark): boolean {
	return benchmark.source === "artificial-analysis";
}

export function benchmarkEfforts(benchmark: CompareViewBenchmark, modelId: string): Set<CompareEffort> {
	return new Set((benchmark.results[modelId] ?? []).map((result) => result.effort).filter((effort): effort is CompareEffort => effort != null));
}

export type EffortLevel = { effort: CompareEffort; models: number };

/** Effort levels any selected model reports, with how many models report each. */
export function effortLevels(benchmarks: CompareViewBenchmark[], modelIds: string[]): EffortLevel[] {
	const byModel = new Map<string, Set<CompareEffort>>();
	for (const benchmark of benchmarks.filter(matchesEffort)) {
		for (const modelId of modelIds) {
			const efforts = benchmarkEfforts(benchmark, modelId);
			if (!efforts.size) continue;
			const set = byModel.get(modelId) ?? new Set<CompareEffort>();
			for (const effort of efforts) set.add(effort);
			byModel.set(modelId, set);
		}
	}
	return EFFORT_ORDER.flatMap((effort) => {
		const models = [...byModel.values()].filter((set) => set.has(effort)).length;
		return models ? [{ effort, models }] : [];
	});
}

/** The highest level every model with effort data reports, else the most reported. */
export function defaultEffort(levels: EffortLevel[]): CompareEffort | null {
	if (!levels.length) return null;
	const most = Math.max(...levels.map((level) => level.models));
	const shared = levels.filter((level) => level.models === most);
	return shared.at(-1)!.effort;
}

export type PickedResult =
	| { kind: "result"; result: CompareViewBenchmarkResult }
	| { kind: "notAtEffort" }
	| { kind: "none" };

/**
 * The result to show for a model: the chosen effort level when the evaluator
 * ran the model at several levels, otherwise the model's best variant. Lab
 * results keep their own settings, so they're never hidden by the effort switch.
 */
export function pickResult(benchmark: CompareViewBenchmark, modelId: string, effort: CompareEffort | null): PickedResult {
	const results = benchmark.results[modelId] ?? [];
	if (!results.length) return { kind: "none" };
	const withEffort = matchesEffort(benchmark) ? results.filter((result) => result.effort != null) : [];
	if (effort && withEffort.length) {
		const match = withEffort.filter((result) => result.effort === effort);
		if (!match.length) return { kind: "notAtEffort" };
		return { kind: "result", result: bestResult(match, benchmark.higherIsBetter) };
	}
	return { kind: "result", result: bestResult(results, benchmark.higherIsBetter) };
}

function bestResult(results: CompareViewBenchmarkResult[], higherIsBetter: boolean): CompareViewBenchmarkResult {
	return results.reduce((best, result) =>
		(higherIsBetter ? result.score > best.score : result.score < best.score) ? result : best
	);
}

export function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
	return a[0] <= b[1] && b[0] <= a[1];
}

export type BenchmarkGroups = { shared: CompareViewBenchmark[]; single: CompareViewBenchmark[] };

const SOURCE_RANK: Record<CompareViewBenchmark["source"], number> = { epoch: 0, "artificial-analysis": 1, independent: 2, lab: 3 };

/** Benchmarks at least two selected models report, and the rest. One model: everything is "shared". */
export function groupBenchmarks(benchmarks: CompareViewBenchmark[], modelIds: string[]): BenchmarkGroups {
	const count = (benchmark: CompareViewBenchmark) => modelIds.filter((id) => (benchmark.results[id]?.length ?? 0) > 0).length;
	const sorted = benchmarks
		.filter((benchmark) => count(benchmark) > 0)
		.sort((a, b) => count(b) - count(a) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.name.localeCompare(b.name));
	const threshold = modelIds.length > 1 ? 2 : 1;
	return {
		shared: sorted.filter((benchmark) => count(benchmark) >= threshold),
		single: sorted.filter((benchmark) => count(benchmark) < threshold),
	};
}

// Verdicts

export type VerdictReason =
	| { type: "cheapest"; value: number }
	| { type: "largestContext"; value: number }
	| { type: "largestOutput"; value: number }
	| { type: "fastest"; value: number }
	| { type: "lowestLatency"; value: number }
	| { type: "topCapability"; value: number }
	| { type: "onlyInput"; modalities: string[] }
	| { type: "mostPlans"; value: number }
	| { type: "latestCutoff"; value: string }
	| { type: "mostRoutes"; value: number };

export type Verdicts = {
	byModel: Record<string, VerdictReason[]>;
	/** The capability index can't separate the models: every pair of intervals overlaps. */
	capabilityTie: boolean;
};

/** Up to three reasons per model, each one a row where that model alone is best. */
export function buildVerdicts(
	models: CompareViewModel[],
	usage: CompareViewUsageByModel,
	benchmarks: CompareViewBenchmark[],
): Verdicts {
	const byModel: Record<string, VerdictReason[]> = Object.fromEntries(models.map((model) => [model.id, []]));
	if (models.length < 2) return { byModel, capabilityTie: false };
	const sameJob = doSameJob(models);
	const sole = (values: Array<number | null | undefined>, direction: Direction, reason: (index: number, value: number) => VerdictReason) => {
		const best = bestIndices(values, direction);
		if (best.size !== 1) return;
		const [index] = [...best];
		byModel[models[index!]!.id]!.push(reason(index!, values[index!]!));
	};

	const eci = benchmarks.find((benchmark) => benchmark.id === ECI_BENCHMARK_ID);
	const eciResults = models.map((model) => (eci ? pickResult(eci, model.id, null) : { kind: "none" as const }));
	const intervals = eciResults.map((picked) => (picked.kind === "result" ? picked.result.ci : null));
	const withInterval = intervals.filter((interval): interval is [number, number] => interval != null);
	const capabilityTie = withInterval.length >= 2 && withInterval.every((a) => withInterval.every((b) => intervalsOverlap(a, b)));
	if (!capabilityTie) {
		sole(eciResults.map((picked) => (picked.kind === "result" ? picked.result.score : null)), "higher", (_, value) => ({ type: "topCapability", value }));
	}
	if (sameJob) {
		sole(models.map((model) => requestCost(model, TYPICAL_REQUEST)), "lower", (_, value) => ({ type: "cheapest", value }));
	}
	sole(models.map((model) => model.contextWindow?.tokens), "higher", (_, value) => ({ type: "largestContext", value }));
	sole(models.map((model) => usage[model.id]?.throughputP50TokPerSec30m), "higher", (_, value) => ({ type: "fastest", value }));
	sole(models.map((model) => usage[model.id]?.latencyP50Ms30m), "lower", (_, value) => ({ type: "lowestLatency", value }));
	for (const model of models) {
		const others = models.filter((other) => other.id !== model.id);
		const only = model.inputTypes.filter((type) => others.every((other) => !other.inputTypes.includes(type)));
		if (only.length && others.every((other) => other.inputTypes.length > 0)) byModel[model.id]!.push({ type: "onlyInput", modalities: only });
	}
	sole(models.map((model) => model.maxOutput?.tokens), "higher", (_, value) => ({ type: "largestOutput", value }));
	sole(models.map((model) => model.subscriptionPlans.length || null), "higher", (_, value) => ({ type: "mostPlans", value }));
	sole(models.map((model) => timeValue(model.knowledgeCutoff)), "higher", (index) => ({ type: "latestCutoff", value: models[index]!.knowledgeCutoff! }));
	sole(models.map((model) => model.providers.length || null), "higher", (_, value) => ({ type: "mostRoutes", value }));

	for (const id of Object.keys(byModel)) byModel[id] = byModel[id]!.slice(0, 3);
	return { byModel, capabilityTie };
}

// Rows

/** A row is the same everywhere when every model shows the same text. */
export function isUniform(values: string[]): boolean {
	return values.length > 1 && values.every((value) => value === values[0]);
}

/** The models a phone shows: two at a time. */
export function visibleOnPhone(index: number, page: number, perPage = 2): boolean {
	return Math.floor(index / perPage) === page;
}
