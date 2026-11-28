import { describe, expect, it } from "vitest";
import {
	activeChartAxis,
	activeEffort,
	boardColumns,
	boardSourceLink,
	formatUsd,
	showEffortFilter,
	buildLeaderboard,
	benchmarkFreshness,
	buildProfile,
	chartAxes,
	citationLabel,
	comparableScore,
	directoryCategories,
	formatBenchmarkValue,
	formatInterval,
	groupByCategory,
	headlineIndexes,
	normalizeCategory,
	profileEfforts,
	sortEfforts,
	topPercent,
	unitKind,
	utcDateFormat,
	type BoardRow,
	type ProfileRow,
} from "./boardResults";

const locale = "en-GB";

describe("formatBenchmarkValue", () => {
	it("formats by unit", () => {
		expect(formatBenchmarkValue(57.345, { unit: "%" }, locale)).toBe("57.3%");
		expect(formatBenchmarkValue(0.43, { unit: "%" }, locale)).toBe("0.43%");
		expect(formatBenchmarkValue(0, { type: "percentage" }, locale)).toBe("0%");
		expect(formatBenchmarkValue(1526.54, { unit: "Elo" }, locale)).toBe("1,527");
		expect(formatBenchmarkValue(0.7806, { unit: "USD" }, locale)).toBe("$0.781");
		expect(formatBenchmarkValue(12.5, { unit: "USD" }, locale)).toBe("$12.50");
		expect(formatBenchmarkValue(0.0042, { unit: "USD" }, locale)).toBe("$0.0042");
		expect(formatBenchmarkValue(1.925, { unit: "s" }, locale)).toBe("1.93 s");
		expect(formatBenchmarkValue(95, { unit: "s" }, locale)).toBe("1.6 min");
		expect(formatBenchmarkValue(33674.5, { unit: "tokens" }, locale)).toBe("33.7k");
		expect(formatBenchmarkValue(212, { unit: "tokens/s" }, locale)).toBe("212 tok/s");
		expect(formatBenchmarkValue(3.75, { unit: "USD/1M tokens" }, locale)).toBe("$3.75/1M");
		expect(formatBenchmarkValue(61.24, { unit: "index" }, locale)).toBe("61.2");
		expect(formatBenchmarkValue(42, { unit: "bugs of 105" }, locale)).toBe("42 bugs of 105");
	});

	it("formats intervals", () => {
		expect(formatInterval(1516.9, 1536.2, { unit: "Elo" }, locale)).toBe("1,517–1,536");
		expect(formatInterval(93.4, 97.5, { unit: "%" }, locale)).toBe("93.4%–97.5%");
		expect(formatInterval(null, 2, { unit: "%" }, locale)).toBeNull();
	});

	it("formats percentages with the locale's sign and spacing", () => {
		expect(formatBenchmarkValue(57.345, { unit: "%" }, "fr-FR")).toBe(new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 }).format(0.57345));
		expect(formatBenchmarkValue(57.345, { unit: "%" }, "fr-FR")).toMatch(/^57,3\s%$/u);
		expect(formatBenchmarkValue(57.3, { unit: "%" }, "tr-TR")).toBe("%57,3");
		expect(formatInterval(93.4, 97.5, { unit: "%" }, "tr-TR")).toBe("%93,4–%97,5");
	});

	it("keeps sub-cent costs distinct", () => {
		expect([0.00001, 0.00002, 0.00003].map(formatUsd)).toEqual(["$0.00001", "$0.00002", "$0.00003"]);
		expect(formatUsd(0.000123)).toBe("$0.00012");
		expect(formatUsd(0)).toBe("$0.00");
		expect(formatUsd(0.05)).toBe("$0.05");
		const ticks = [0.00001, 0.00002, 0.00005, 0.0001].map(formatUsd);
		expect(new Set(ticks).size).toBe(ticks.length);
	});

	it("classifies units", () => {
		expect(unitKind({ unit: null, type: "percentage" })).toBe("percent");
		expect(unitKind({ unit: "TrueSkill" })).toBe("plain");
		expect(unitKind({ unit: "years" })).toBe("suffix");
	});
});

describe("comparableScore", () => {
	it("never rescales scraped results, even below 1", () => {
		for (const value of [0.21, 0.76, 1, 57]) expect(comparableScore({ score_numeric: value, source_id: "board" }, "percentage")).toBe(value);
	});
	it("keeps the fraction heuristic for hand-entered percentages", () => {
		expect(comparableScore({ score: "0.76", source_id: null }, "percentage")).toBe(76);
		expect(comparableScore({ score: "76%", source_id: null }, null)).toBe(76);
		expect(comparableScore({ score: "0.76", source_id: null }, "numerical")).toBe(0.76);
		expect(comparableScore({ score: "n/a" }, "percentage")).toBeNull();
	});
});

function row(overrides: Partial<BoardRow>): BoardRow {
	return {
		id: overrides.id ?? Math.random().toString(36), modelId: "lab/a", modelName: "A", organisationId: "lab", organisationName: "Lab", organisationColour: null,
		releaseDate: null, score: null, selfReported: false, sourceId: "board", effort: null, harness: null, config: null, variant: null,
		ciLow: null, ciHigh: null, costUsd: null, durationSeconds: null, outputTokens: null, observedOn: null, link: null, note: null,
		...overrides,
	};
}

describe("buildLeaderboard", () => {
	const rows = [
		row({ id: "a-high", modelId: "lab/a", modelName: "A", score: 80, effort: "high" }),
		row({ id: "a-low", modelId: "lab/a", modelName: "A", score: 60, effort: "low" }),
		row({ id: "a-claim", modelId: "lab/a", modelName: "A", score: 95, selfReported: true, sourceId: null }),
		row({ id: "b", modelId: "lab/b", modelName: "B", score: 80, effort: "high" }),
		row({ id: "c-claim", modelId: "lab/c", modelName: "C", score: 70, selfReported: true, sourceId: null }),
		row({ id: "d", modelId: "lab/d", modelName: "D", score: null }),
	];

	it("collapses each model into its best independent configuration with competition ranks", () => {
		const board = buildLeaderboard(rows, { higherIsBetter: true });
		expect(board.map((entry) => [entry.best.id, entry.rank])).toEqual([["a-high", 1], ["b", 1], ["c-claim", 3], ["d", null]]);
		expect(board[0].others.map((other) => other.id)).toEqual(["a-claim", "a-low"]);
	});

	it("filters by effort and honours lower-is-better", () => {
		expect(buildLeaderboard(rows, { higherIsBetter: true, effort: "low" }).map((entry) => entry.best.id)).toEqual(["a-low"]);
		expect(buildLeaderboard(rows.slice(0, 2), { higherIsBetter: false }).map((entry) => entry.best.id)).toEqual(["a-low"]);
	});

	it("shows only columns the board has", () => {
		expect(boardColumns(rows)).toMatchObject({ effort: true, harness: false, cost: false, selfReported: true });
		expect(chartAxes(rows)).toEqual([]);
		expect(chartAxes([1, 2, 3].map((n) => row({ score: n, costUsd: n, releaseDate: "2026-01-01" })))).toEqual(["release", "cost"]);
	});

	it("falls back to an axis the board still has", () => {
		expect(activeChartAxis(["release", "cost"], null)).toBe("cost");
		expect(activeChartAxis(["release", "cost"], "release")).toBe("release");
		expect(activeChartAxis(["release"], "cost")).toBe("release");
	});

	it("keeps the effort filter reachable", () => {
		expect(showEffortFilter(["high"], true, "high")).toBe(true);
		expect(showEffortFilter(["high"], true, null)).toBe(true);
		expect(showEffortFilter(["high"], false, null)).toBe(false);
		expect(showEffortFilter(["low", "high"], false, null)).toBe(true);
		expect(showEffortFilter([], true, null)).toBe(false);
	});

	it("labels the outbound link with the site it opens", () => {
		expect(boardSourceLink("https://bench.example/paper", { url: "https://evals.example", publisher: "Evals" })).toEqual({ href: "https://evals.example", sourceName: "Evals" });
		expect(boardSourceLink("https://bench.example/paper", { url: null, publisher: "Evals" })).toEqual({ href: "https://bench.example/paper", sourceName: null });
		expect(boardSourceLink(null, undefined)).toBeNull();
	});
});

function profile(overrides: Partial<ProfileRow>): ProfileRow {
	return { id: overrides.id ?? Math.random().toString(36), benchmarkId: "gpqa", benchmarkName: "GPQA", higherIsBetter: true, selfReported: false, ...overrides };
}

describe("buildProfile", () => {
	const rows = [
		profile({ id: "gpqa-claim", benchmarkId: "gpqa", score: 88, selfReported: true, category: "science" }),
		profile({ id: "gpqa-high", benchmarkId: "gpqa", score: 84, effort: "high", sourceId: "vals", rank: 4, rankedModels: 120, category: "science" }),
		profile({ id: "gpqa-low", benchmarkId: "gpqa", score: 79, effort: "low", sourceId: "vals", category: "science" }),
		profile({ id: "swe-claim", benchmarkId: "swe", benchmarkName: "SWE-bench", score: 70, selfReported: true, category: "coding" }),
		profile({ id: "elo", benchmarkId: "lmarena-text", benchmarkName: "LMArena Text", score: 1500, unit: "Elo", sourceId: "lmarena", rank: 2, rankedModels: 200, category: "general" }),
	];

	it("shows the independent result first and attaches the self-reported one", () => {
		const gpqa = buildProfile(rows).find((item) => item.benchmarkId === "gpqa")!;
		expect(gpqa.primary.id).toBe("gpqa-high");
		expect(gpqa.selfReported?.id).toBe("gpqa-claim");
		expect(gpqa.others.map((other) => other.id)).toEqual(["gpqa-low"]);
		const swe = buildProfile(rows).find((item) => item.benchmarkId === "swe")!;
		expect(swe.primary.id).toBe("swe-claim");
		expect(swe.selfReported).toBeUndefined();
	});

	it("filters by effort without hiding benchmarks that have no effort data", () => {
		const low = buildProfile(rows, "low");
		expect(low.find((item) => item.benchmarkId === "gpqa")?.primary.id).toBe("gpqa-low");
		expect(low.map((item) => item.benchmarkId).sort()).toEqual(["gpqa", "lmarena-text", "swe"]);
		expect(buildProfile(rows, "max").map((item) => item.benchmarkId).sort()).toEqual(["lmarena-text", "swe"]);
		expect(profileEfforts(rows)).toEqual(["low", "high"]);
	});

	it("drops a selected effort the current rows no longer offer", () => {
		expect(activeEffort(["low", "high"], "high")).toBe("high");
		expect(activeEffort(["low"], "high")).toBeNull();
		expect(activeEffort(["low"], null)).toBeNull();
	});

	it("drops the best-configuration rank when an effort filter shows another configuration", () => {
		const gpqaRows = rows.filter((row) => row.benchmarkId === "gpqa").map((row) => (row.id === "gpqa-low" ? { ...row, rank: 4, rankedModels: 120 } : row));
		expect(buildProfile(gpqaRows)[0]).toMatchObject({ rank: 4, rankedModels: 120 });
		expect(buildProfile(gpqaRows, "high")[0].rank).toBe(4);
		expect(buildProfile(gpqaRows, "low")[0]).toMatchObject({ rank: undefined, rankedModels: 120 });
	});

	it("groups by normalised category, largest first", () => {
		const groups = groupByCategory(buildProfile(rows));
		expect(groups.map((group) => group.category).sort()).toEqual(["code", "general", "science"]);
		expect(normalizeCategory("coding")).toBe("code");
		expect(normalizeCategory("instruction_following")).toBe("instruction-following");
		expect(normalizeCategory(null)).toBe("other");
		expect(normalizeCategory("unheard-of")).toBe("other");
	});

	it("picks headline indexes that have a value, newest AA version first", () => {
		const indexes = headlineIndexes(buildProfile([
			profile({ benchmarkId: "aa-intelligence-index-v4", score: 60 }),
			profile({ benchmarkId: "aa-intelligence-index-v5", score: 52, rank: 3, rankedModels: 150 }),
			profile({ benchmarkId: "lmarena-text", score: 1500, rank: 2, rankedModels: 200 }),
			profile({ benchmarkId: "design-arena-overall" }),
		]));
		expect(indexes.map((item) => [item.key, item.benchmark.benchmarkId, item.topPercent])).toEqual([
			["aaIntelligence", "aa-intelligence-index-v5", 2],
			["arenaText", "lmarena-text", 1],
		]);
	});
});

describe("efforts in variants", () => {
	it("reads a known effort from the variant of hand-entered rows and matches claims at the selected effort", () => {
		const rows = [
			profile({ id: "aa-max", benchmarkId: "aa-intelligence-index-v5", score: 27.9, variant: "max" }),
			profile({ id: "aa-low", benchmarkId: "aa-intelligence-index-v5", score: 9.7, variant: "low" }),
			profile({ id: "claim-low", benchmarkId: "aa-intelligence-index-v5", score: 12, selfReported: true, variant: "low" }),
			profile({ id: "claim-max", benchmarkId: "aa-intelligence-index-v5", score: 30, selfReported: true, variant: "max" }),
			profile({ id: "odd", benchmarkId: "other", score: 1, variant: "instruct-max" }),
		];
		expect(profileEfforts(rows)).toEqual(["low", "max"]);
		const low = buildProfile(rows, "low").find((item) => item.benchmarkId === "aa-intelligence-index-v5")!;
		expect([low.primary.id, low.selfReported?.id]).toEqual(["aa-low", "claim-low"]);
		expect(buildProfile(rows, "low").some((item) => item.benchmarkId === "other")).toBe(true);
	});
});

describe("helpers", () => {
	it("orders efforts and computes top percent", () => {
		expect(sortEfforts(["high", "max", "custom", "low", "high"])).toEqual(["low", "high", "max", "custom"]);
		expect(topPercent(3, 150)).toBe(2);
		expect(topPercent(1, 1)).toBeNull();
	});
});

describe("directoryCategories", () => {
	it("keeps the selected category when the other filters leave it empty", () => {
		const { category, counts } = directoryCategories(["general", "general", "other"], "code");
		expect(category).toBe("code");
		expect(counts).toEqual([["general", 2], ["code", 0], ["other", 1]]);
	});

	it("ignores unknown categories", () => {
		expect(directoryCategories(["general"], "not-a-category").category).toBeNull();
		expect(directoryCategories(["general"], "").category).toBeNull();
	});
});

describe("benchmarkFreshness", () => {
	it("prefers the source sync over later observations and edits, like the benchmarks index", () => {
		expect(benchmarkFreshness("2026-11-20T00:00:00Z", ["2026-11-25"], ["2026-11-27T00:00:00Z"])?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
	});

	it("falls back to the newest observation, then the newest edit", () => {
		expect(benchmarkFreshness(null, ["2026-11-22", "2026-11-25", null], ["2026-11-27T00:00:00Z"])?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
		expect(benchmarkFreshness(undefined, [], ["2026-11-01T00:00:00Z", "bad"])?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
		expect(benchmarkFreshness(null, [], [])).toBeNull();
	});
});

describe("citationLabel", () => {
	it("uses the source, else the link host", () => {
		expect(citationLabel("Publisher", "https://example.com/report")).toBe("Publisher");
		expect(citationLabel(undefined, "https://www.example.com/launch")).toBe("example.com");
		expect(citationLabel(undefined, "not a url")).toBeNull();
		expect(citationLabel(undefined, undefined)).toBeNull();
	});
});

describe("utcDateFormat", () => {
	it("keeps UTC month ticks in their month in any time zone", () => {
		const format = utcDateFormat("en-US", { month: "short", year: "numeric" });
		expect(format.resolvedOptions().timeZone).toBe("UTC");
		expect(format.format(new Date(Date.UTC(2026, 2, 1)))).toBe("Mar 2026");
	});
});
