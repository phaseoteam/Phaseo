/**
 * Display logic for benchmark leaderboards and a model's benchmark profile, shared by the benchmark
 * page, the benchmarks index and the model page.
 *
 * Score scale: scraped results (`sourceId` set) are already in the benchmark's own scale, so
 * percentages are points (0–100) even below 1. Only hand-entered percentage results may be stored as
 * fractions (0.76 for 76%), and only those get the fraction heuristic.
 */

import { MONEY_LOCALE } from "@/lib/displayPreferences";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

export type BenchmarkScale = {
	unit?: string | null;
	type?: string | null;
	higherIsBetter: boolean;
};

export type UnitKind = "percent" | "elo" | "usd" | "gbp" | "seconds" | "minutes" | "tokens" | "tokensPerSecond" | "usdPerMillionTokens" | "plain" | "suffix";

const PLAIN_UNITS = new Set(["score", "points", "pts", "index", "rating", "trueskill", "auarc"]);

export function unitKind(scale: Pick<BenchmarkScale, "unit" | "type">): UnitKind {
	const unit = scale.unit?.trim().toLowerCase() ?? "";
	if (unit === "%" || (!unit && scale.type === "percentage")) return "percent";
	if (unit === "elo") return "elo";
	if (unit === "usd" || unit === "$") return "usd";
	if (unit === "£" || unit === "gbp") return "gbp";
	if (unit === "s" || unit === "seconds") return "seconds";
	if (unit === "minutes" || unit === "min") return "minutes";
	if (unit === "tokens") return "tokens";
	if (unit === "tokens/s") return "tokensPerSecond";
	if (unit === "usd/1m tokens") return "usdPerMillionTokens";
	if (!unit || PLAIN_UNITS.has(unit)) return "plain";
	return "suffix";
}

/** Whether the unit is shown next to the column heading rather than on every value. */
export function unitLabel(scale: Pick<BenchmarkScale, "unit" | "type">): string | null {
	const kind = unitKind(scale);
	if (kind === "elo") return "Elo";
	if (kind === "plain" && scale.unit && !["score", "points"].includes(scale.unit.toLowerCase())) return scale.unit;
	return null;
}

function decimalsFor(value: number) {
	const magnitude = Math.abs(value);
	if (magnitude === 0) return 0;
	if (magnitude < 1) return 2;
	if (magnitude < 100) return 1;
	return 0;
}

function fixed(value: number, locale: string, maximumFractionDigits: number, minimumFractionDigits = 0) {
	return new Intl.NumberFormat(locale, { maximumFractionDigits, minimumFractionDigits }).format(value);
}

export function formatUsd(value: number) {
	const magnitude = Math.abs(value);
	// Sub-cent costs keep two significant digits, so $0.00001 and $0.00002 stay distinct instead of rounding to $0.00.
	if (magnitude > 0 && magnitude < 0.01) return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", maximumSignificantDigits: 2 }).format(value);
	const digits = magnitude === 0 ? 2 : magnitude < 1 ? 3 : 2;
	return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

/** A percentage given in points (57.3 for 57.3%), with the locale's percent sign and spacing. */
export function formatPercent(value: number, locale: string, maximumFractionDigits: number) {
	return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits }).format(value / 100);
}

export function formatDuration(seconds: number, locale: string) {
	if (Math.abs(seconds) < 60) return `${fixed(seconds, locale, seconds < 10 ? 2 : 1)} s`;
	if (Math.abs(seconds) < 3600) return `${fixed(seconds / 60, locale, 1)} min`;
	return `${fixed(seconds / 3600, locale, 1)} h`;
}

export function formatTokenCount(value: number, locale: string) {
	return new Intl.NumberFormat(locale, { notation: Math.abs(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(value) >= 10_000 ? 1 : 0 }).format(value);
}

/** A score in the benchmark's unit: 57.3%, 0.43%, 1,526, $0.781, 1.93 s, 33.7K. */
export function formatBenchmarkValue(value: number, scale: Pick<BenchmarkScale, "unit" | "type">, locale: string): string {
	switch (unitKind(scale)) {
		case "percent": return formatPercent(value, locale, Math.abs(value) < 1 && value !== 0 ? 2 : 1);
		case "elo": return fixed(value, locale, 0);
		case "usd": return formatUsd(value);
		case "gbp": return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(value);
		case "seconds": return formatDuration(value, locale);
		case "minutes": return `${fixed(value, locale, 1)} min`;
		case "tokens": return formatTokenCount(value, locale);
		case "tokensPerSecond": return `${fixed(value, locale, 0)} tok/s`;
		case "usdPerMillionTokens": return `${formatUsd(value)}/1M`;
		case "plain": return fixed(value, locale, decimalsFor(value));
		default: return `${fixed(value, locale, decimalsFor(value))} ${scale.unit}`;
	}
}

export function formatInterval(low: number | null | undefined, high: number | null | undefined, scale: Pick<BenchmarkScale, "unit" | "type">, locale: string): string | null {
	if (low == null || high == null) return null;
	const kind = unitKind(scale);
	// Each bound carries its own percent sign: locales differ on its position and spacing, so it can't be shared.
	const format = (value: number) => kind === "percent" ? formatPercent(value, locale, 1) : kind === "elo" ? fixed(value, locale, 0) : formatBenchmarkValue(value, scale, locale);
	return `${format(low)}–${format(high)}`;
}

function parseLooseNumber(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string") return null;
	const match = value.replace(/,/g, "").match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
	const parsed = match ? Number(match[0]) : Number.NaN;
	return Number.isFinite(parsed) ? parsed : null;
}

/** A result's score in the benchmark's scale; see the score scale note at the top of this file. */
export function comparableScore(result: { score?: unknown; score_numeric?: unknown; source_id?: string | null }, type: string | null | undefined): number | null {
	const value = parseLooseNumber(result.score_numeric) ?? parseLooseNumber(result.score);
	if (value == null) return null;
	if (result.source_id) return value;
	const looksPercentage = type === "percentage" || (typeof result.score === "string" && result.score.trim().endsWith("%"));
	return looksPercentage && Math.abs(value) > 0 && Math.abs(value) <= 1 && !(typeof result.score === "string" && result.score.includes("%")) ? value * 100 : value;
}

export function isBetter(a: number, b: number, higherIsBetter: boolean) {
	return higherIsBetter ? a > b : a < b;
}

const EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** The reasoning effort of a result: its effort column, else a variant that names an effort (hand-entered rows keep it there). */
export function effortOf(effort: string | null | undefined, variant: string | null | undefined): string | null {
	if (effort) return effort;
	const candidate = variant?.trim().toLowerCase();
	return candidate && EFFORT_ORDER.includes(candidate) ? candidate : null;
}

export function rowEffort(row: { effort?: string | null; variant?: string | null }): string | null {
	return effortOf(row.effort, row.variant);
}

export function sortEfforts(efforts: Iterable<string>): string[] {
	return [...new Set(efforts)].sort((a, b) => {
		const left = EFFORT_ORDER.indexOf(a.toLowerCase());
		const right = EFFORT_ORDER.indexOf(b.toLowerCase());
		if (left !== right) return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
		return a.localeCompare(b);
	});
}

// ---------------------------------------------------------------------------------------------
// Leaderboard (benchmark page)

export type BoardRow = {
	id: string;
	modelId: string;
	modelName: string;
	organisationId: string | null;
	organisationName: string | null;
	organisationColour: string | null;
	releaseDate: string | null;
	score: number | null;
	selfReported: boolean;
	sourceId: string | null;
	effort: string | null;
	harness: string | null;
	config: string | null;
	variant: string | null;
	ciLow: number | null;
	ciHigh: number | null;
	costUsd: number | null;
	durationSeconds: number | null;
	outputTokens: number | null;
	observedOn: string | null;
	link: string | null;
	note: string | null;
};

/** Benchmark page payload rows in display form. */
export function toBoardRows(benchmark: Pick<BenchmarkPage, "results" | "type">): BoardRow[] {
	return (benchmark.results ?? []).map((result) => {
		const organisation = result.model?.organisation ?? null;
		return {
			id: result.id,
			modelId: result.model_id,
			modelName: result.model?.name ?? result.model_id,
			organisationId: organisation?.organisation_id ?? result.model_id.split("/")[0] ?? null,
			organisationName: organisation?.name ?? organisation?.display_name ?? null,
			organisationColour: organisation?.colour ?? null,
			releaseDate: result.model?.release_date ?? result.model?.announcement_date ?? null,
			score: comparableScore(result, benchmark.type),
			selfReported: Boolean(result.is_self_reported),
			sourceId: result.source_id ?? null,
			effort: effortOf(result.effort, result.variant),
			harness: result.harness ?? null,
			config: result.config ?? null,
			variant: result.variant ?? null,
			ciLow: result.ci_low ?? null,
			ciHigh: result.ci_high ?? null,
			costUsd: result.cost_usd ?? null,
			durationSeconds: result.duration_seconds ?? null,
			outputTokens: result.output_tokens ?? null,
			observedOn: result.observed_on ?? null,
			link: result.source_link ?? null,
			// Scraped rows carry their configuration and attribution in other_info, already shown as columns.
			note: !result.source_id && typeof result.other_info === "string" ? result.other_info : null,
		};
	});
}

export type LeaderboardEntry = {
	rank: number | null;
	best: BoardRow;
	/** The model's other configurations on this board, best first. */
	others: BoardRow[];
};

function bestRow(rows: BoardRow[], higherIsBetter: boolean): BoardRow | undefined {
	return rows.reduce<BoardRow | undefined>((best, row) => {
		if (row.score == null) return best ?? row;
		if (!best || best.score == null || isBetter(row.score, best.score, higherIsBetter)) return row;
		return best;
	}, undefined);
}

function byScore(higherIsBetter: boolean) {
	return (a: BoardRow, b: BoardRow) => {
		if (a.score == null || b.score == null) return a.score == null ? (b.score == null ? 0 : 1) : -1;
		return higherIsBetter ? b.score - a.score : a.score - b.score;
	};
}

/**
 * One entry per model: its best independent configuration (or best self-reported one when it has
 * no independent result), with the rest listed under it. Ranks are competition ranks (1, 2, 2, 4).
 */
export function buildLeaderboard(rows: BoardRow[], options: { higherIsBetter: boolean; effort?: string | null }): LeaderboardEntry[] {
	const filtered = options.effort ? rows.filter((row) => row.effort === options.effort) : rows;
	const byModel = new Map<string, BoardRow[]>();
	for (const row of filtered) byModel.set(row.modelId, [...(byModel.get(row.modelId) ?? []), row]);
	const entries = [...byModel.values()].map((modelRows) => {
		const independent = modelRows.filter((row) => !row.selfReported);
		const best = bestRow(independent.length ? independent : modelRows, options.higherIsBetter)!;
		return { best, others: modelRows.filter((row) => row !== best).sort(byScore(options.higherIsBetter)) };
	});
	entries.sort((a, b) => byScore(options.higherIsBetter)(a.best, b.best) || a.best.modelName.localeCompare(b.best.modelName));
	let previous: number | null = null;
	let previousRank = 0;
	return entries.map((entry, index) => {
		if (entry.best.score == null) return { ...entry, rank: null };
		const rank = previous !== null && entry.best.score === previous ? previousRank : index + 1;
		previous = entry.best.score;
		previousRank = rank;
		return { ...entry, rank };
	});
}

export type BoardColumns = { effort: boolean; harness: boolean; config: boolean; interval: boolean; cost: boolean; tokens: boolean; duration: boolean; selfReported: boolean };

export function boardColumns(rows: BoardRow[]): BoardColumns {
	return {
		effort: rows.some((row) => row.effort),
		harness: rows.some((row) => row.harness),
		config: rows.some((row) => row.config),
		interval: rows.some((row) => row.ciLow != null && row.ciHigh != null),
		cost: rows.some((row) => row.costUsd != null),
		tokens: rows.some((row) => row.outputTokens != null),
		duration: rows.some((row) => row.durationSeconds != null),
		selfReported: rows.some((row) => row.selfReported),
	};
}

/** Score against release date by default; score against cost when enough rows carry a cost. */
export function chartAxes(rows: BoardRow[]): Array<"release" | "cost"> {
	const axes: Array<"release" | "cost"> = [];
	if (rows.filter((row) => row.score != null && row.releaseDate).length >= 3) axes.push("release");
	if (rows.filter((row) => row.score != null && row.costUsd != null && row.costUsd > 0).length >= 3) axes.push("cost");
	return axes;
}

/** The chart axis to show: the reader's choice while the board still offers it, else cost, else release date. */
export function activeChartAxis(axes: Array<"release" | "cost">, selected: "release" | "cost" | null): "release" | "cost" {
	if (selected && axes.includes(selected)) return selected;
	return axes.includes("cost") ? "cost" : axes[0] ?? "release";
}

/**
 * Whether to offer the effort filter: when there is a choice (two named efforts, or one beside
 * untagged rows), and always while a filter is active so "All efforts" stays reachable.
 */
export function showEffortFilter(efforts: string[], hasUntagged: boolean, active: string | null | undefined) {
	return Boolean(active) || efforts.length > 1 || (efforts.length === 1 && hasUntagged);
}

/**
 * The board's outbound link. A registered source URL opens that source under its name; otherwise
 * the benchmark's own page opens under a generic label, so the label never names a publisher the
 * link doesn't go to.
 */
export function boardSourceLink(benchmarkLink: string | null | undefined, source: { url?: string | null; publisher?: string | null; name?: string | null } | null | undefined): { href: string; sourceName: string | null } | null {
	const sourceName = source?.publisher ?? source?.name ?? null;
	// A source can publish several boards (WeirdML v2 and v3), so the benchmark's own page wins. The publisher's
	// name labels it only when it is on the publisher's site; otherwise the generic label is used.
	if (benchmarkLink) return { href: benchmarkLink, sourceName: source?.url && sameHost(benchmarkLink, source.url) ? sourceName : null };
	if (source?.url) return { href: source.url, sourceName };
	return null;
}

function sameHost(a: string, b: string): boolean {
	try {
		return new URL(a).host === new URL(b).host;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------------------------
// Model profile (model page)

export type ProfileRow = {
	id: string;
	benchmarkId: string;
	benchmarkName: string;
	category?: string;
	unit?: string;
	type?: string;
	higherIsBetter: boolean;
	score?: number;
	scoreText?: string;
	selfReported: boolean;
	sourceId?: string;
	sourceName?: string;
	publisher?: string;
	attribution?: string;
	sourceUrl?: string;
	effort?: string;
	harness?: string;
	config?: string;
	variant?: string;
	note?: string;
	link?: string;
	ciLow?: number;
	ciHigh?: number;
	costUsd?: number;
	durationSeconds?: number;
	outputTokens?: number;
	observedOn?: string;
	updatedAt?: string;
	rank?: number;
	rankedModels?: number;
};

export type ProfileBenchmark = {
	benchmarkId: string;
	name: string;
	category: BenchmarkCategory;
	scale: BenchmarkScale;
	/** The independent result shown first, or the self-reported one when nothing independent exists. */
	primary: ProfileRow;
	/** The lab's own claim, shown under an independent result for the same benchmark. */
	selfReported?: ProfileRow;
	/** Other configurations of the model on this benchmark, best first. */
	others: ProfileRow[];
	rank?: number;
	rankedModels?: number;
};

function bestProfileRow(rows: ProfileRow[], higherIsBetter: boolean): ProfileRow | undefined {
	return rows.reduce<ProfileRow | undefined>((best, row) => {
		if (row.score == null) return best ?? row;
		if (!best || best.score == null || isBetter(row.score, best.score, higherIsBetter)) return row;
		return best;
	}, undefined);
}

export function profileEfforts(rows: ProfileRow[]): string[] {
	return sortEfforts(rows.flatMap((row) => { const effort = rowEffort(row); return effort && !row.selfReported ? [effort] : []; }));
}

/** The effort to filter by: the reader's last choice while the current rows still offer it, else none (best effort). */
export function activeEffort(efforts: string[], selected: string | null | undefined): string | null {
	return selected && efforts.includes(selected) ? selected : null;
}

/**
 * One entry per benchmark. Independent results come first; a self-reported result for the same
 * benchmark is attached to it rather than listed as a second, unexplained row. With an effort
 * selected, benchmarks that report efforts show only that effort; benchmarks without effort data
 * are unaffected.
 */
export function buildProfile(rows: ProfileRow[], effort: string | null = null): ProfileBenchmark[] {
	const byBenchmark = new Map<string, ProfileRow[]>();
	for (const row of rows) byBenchmark.set(row.benchmarkId, [...(byBenchmark.get(row.benchmarkId) ?? []), row]);
	const benchmarks: ProfileBenchmark[] = [];
	for (const [benchmarkId, benchmarkRows] of byBenchmark) {
		const first = benchmarkRows[0];
		const higherIsBetter = first.higherIsBetter;
		const tagged = benchmarkRows.some((row) => rowEffort(row) && !row.selfReported);
		const independent = benchmarkRows.filter((row) => !row.selfReported && (!effort || !tagged || rowEffort(row) === effort));
		const claims = benchmarkRows.filter((row) => row.selfReported);
		const claimsAtEffort = effort ? claims.filter((row) => rowEffort(row) === effort) : [];
		const selfReported = claimsAtEffort.length ? claimsAtEffort : claims;
		if (effort && tagged && !independent.length) continue;
		const bestIndependent = bestProfileRow(independent, higherIsBetter);
		const bestSelf = bestProfileRow(selfReported, higherIsBetter);
		const primary = bestIndependent ?? bestSelf;
		if (!primary) continue;
		// Stored ranks are the model's best configuration, so they only describe the row when it is that configuration.
		const bestOverall = bestProfileRow(benchmarkRows.filter((row) => !row.selfReported), higherIsBetter) ?? bestProfileRow(claims, higherIsBetter);
		const others = (bestIndependent ? independent : selfReported).filter((row) => row !== primary)
			.sort((a, b) => (a.score == null ? 1 : b.score == null ? -1 : higherIsBetter ? b.score - a.score : a.score - b.score));
		benchmarks.push({
			benchmarkId,
			name: first.benchmarkName,
			category: normalizeCategory(first.category),
			scale: { unit: first.unit, type: first.type, higherIsBetter },
			primary,
			selfReported: bestIndependent ? bestSelf : undefined,
			others,
			rank: primary === bestOverall ? primary.rank : undefined,
			rankedModels: primary.rankedModels,
		});
	}
	return benchmarks;
}

export function groupByCategory<T extends { category: BenchmarkCategory; name: string; rankedModels?: number }>(items: T[]): Array<{ category: BenchmarkCategory; items: T[] }> {
	const groups = new Map<BenchmarkCategory, T[]>();
	for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
	return [...groups.entries()]
		.map(([category, groupItems]) => ({ category, items: groupItems.sort((a, b) => (b.rankedModels ?? 0) - (a.rankedModels ?? 0) || a.name.localeCompare(b.name)) }))
		.sort((a, b) => (a.category === "other" ? 1 : b.category === "other" ? -1 : b.items.length - a.items.length || a.category.localeCompare(b.category)));
}

/** "Top 3%": the share of ranked models at or above this rank. */
export function topPercent(rank: number | null | undefined, total: number | null | undefined): number | null {
	if (!rank || !total || total < 2) return null;
	return Math.max(1, Math.ceil((rank / total) * 100));
}

// ---------------------------------------------------------------------------------------------
// Headline indexes

export type IndexKey = "aaIntelligence" | "aaCoding" | "aaAgentic" | "aaProgress" | "epochEci" | "arenaText" | "arenaWebdev" | "designArena" | "agentArena";

export const INDEX_DEFINITIONS: ReadonlyArray<{ key: IndexKey; publisher: string; match: (id: string) => number | null }> = [
	{ key: "aaIntelligence", publisher: "Artificial Analysis", match: versioned(/^aa-intelligence-index-v(\d+)$/) },
	{ key: "aaCoding", publisher: "Artificial Analysis", match: versioned(/^aa-coding-index-v(\d+)$/) },
	{ key: "aaAgentic", publisher: "Artificial Analysis", match: versioned(/^aa-agentic-index-v(\d+)$/) },
	{ key: "aaProgress", publisher: "Artificial Analysis", match: exact("aa-progress-index-v1") },
	{ key: "epochEci", publisher: "Epoch AI", match: exact("epoch-capabilities-index") },
	{ key: "arenaText", publisher: "LMArena", match: exact("lmarena-text") },
	{ key: "arenaWebdev", publisher: "LMArena", match: exact("lmarena-webdev") },
	{ key: "designArena", publisher: "Design Arena", match: exact("design-arena-overall") },
	{ key: "agentArena", publisher: "Agent Arena", match: exact("agentarena-index") },
];

function versioned(pattern: RegExp) {
	return (id: string) => {
		const version = id.match(pattern)?.[1];
		return version ? Number(version) : null;
	};
}

function exact(target: string) {
	return (id: string) => (id === target ? 0 : null);
}

export type IndexFigure = { key: IndexKey; publisher: string; benchmark: ProfileBenchmark; topPercent: number | null };

/** Headline figures that have a value, in a fixed order; AA indexes use their newest version the model has. */
export function headlineIndexes(benchmarks: ProfileBenchmark[]): IndexFigure[] {
	return INDEX_DEFINITIONS.flatMap((definition) => {
		const candidates = benchmarks
			.map((benchmark) => ({ benchmark, version: definition.match(benchmark.benchmarkId) }))
			.filter((item): item is { benchmark: ProfileBenchmark; version: number } => item.version !== null && item.benchmark.primary.score != null)
			.sort((a, b) => b.version - a.version);
		const chosen = candidates[0]?.benchmark;
		return chosen ? [{ key: definition.key, publisher: definition.publisher, benchmark: chosen, topPercent: topPercent(chosen.rank, chosen.rankedModels) }] : [];
	});
}

export function isHeadlineIndex(benchmarkId: string) {
	return INDEX_DEFINITIONS.some((definition) => definition.match(benchmarkId) !== null);
}

// ---------------------------------------------------------------------------------------------
// Categories

export const BENCHMARK_CATEGORIES = [
	"general", "reasoning", "math", "code", "agents", "knowledge", "science", "hallucinations", "multimodal", "vision",
	"video", "audio", "3d", "creative", "games", "communication", "language", "instruction-following", "long-context",
	"finance", "legal", "medical", "professional", "education", "security", "safety", "reliability", "grounding",
	"speed", "cost", "usage", "other",
] as const;

export type BenchmarkCategory = (typeof BENCHMARK_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, BenchmarkCategory> = {
	coding: "code",
	agentic: "agents",
	creativity: "creative",
	instruction_following: "instruction-following",
	long_context: "long-context",
	healthcare: "medical",
	cybersecurity: "security",
	speech: "audio",
};

export function normalizeCategory(raw: string | null | undefined): BenchmarkCategory {
	const key = raw?.trim().toLowerCase().replace(/\s+/g, "-") ?? "";
	if (!key) return "other";
	const alias = CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[key.replace(/-/g, "_")];
	if (alias) return alias;
	return (BENCHMARK_CATEGORIES as readonly string[]).includes(key) ? (key as BenchmarkCategory) : "other";
}

/**
 * The directory's category filter. The URL's category stays selected even when search or the source
 * filter leaves it no matches, so the filters combine instead of the category silently resetting.
 * Unknown categories fall back to all.
 */
export function directoryCategories(keys: BenchmarkCategory[], categoryParam: string | null | undefined): { category: BenchmarkCategory | null; counts: Array<[BenchmarkCategory, number]> } {
	const category = categoryParam && (BENCHMARK_CATEGORIES as readonly string[]).includes(categoryParam) ? (categoryParam as BenchmarkCategory) : null;
	const counts = new Map<BenchmarkCategory, number>();
	for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	if (category && !counts.has(category)) counts.set(category, 0);
	return {
		category,
		counts: [...counts.entries()].sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : b[1] - a[1])),
	};
}

// ---------------------------------------------------------------------------------------------
// Freshness, citations and dates

function latestOf(values: Array<string | null | undefined>): Date | null {
	return values.reduce<Date | null>((latest, value) => {
		if (!value) return latest;
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return latest;
		return !latest || parsed > latest ? parsed : latest;
	}, null);
}

/**
 * When a benchmark was last updated, the same rule as the benchmarks index: the source's last
 * successful sync, else the newest observation, else the newest row edit.
 */
export function benchmarkFreshness(sourceSync: string | null | undefined, observed: Array<string | null | undefined>, edited: Array<string | null | undefined>): Date | null {
	return latestOf([sourceSync]) ?? latestOf(observed) ?? latestOf(edited);
}

/** The text for a result's citation: its source, else the linked site's host. */
export function citationLabel(source: string | null | undefined, href: string | null | undefined): string | null {
	if (source) return source;
	if (!href) return null;
	try {
		return new URL(href).hostname.replace(/^www\./, "") || null;
	} catch {
		return null;
	}
}

/** Calendar dates and month ticks are UTC midnights, so they're formatted in UTC to keep the day and month. */
export function utcDateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
}
