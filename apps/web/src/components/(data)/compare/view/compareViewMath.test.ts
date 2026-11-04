import {
	bestBenchmarkIndices,
	bestIndices,
	distinctDigits,
	buildVerdicts,
	defaultEffort,
	describeCondition,
	parseLegacyCondition,
	providerLines,
	doSameJob,
	effortLevels,
	formatUsd,
	groupBenchmarks,
	activeTier,
	applyRoute,
	extraBands,
	pickResult,
	priceRow,
	requestCost,
	sortTiers,
	timeValue,
	tokenPrice,
	TYPICAL_REQUEST,
	visibleOnPhone,
} from "./compareViewMath";
import type { CompareViewBenchmark, CompareViewModel, CompareViewPriceRow } from "./types";

const tokens = (kind: CompareViewPriceRow["kind"], perMillion: number, conditional = false): CompareViewPriceRow => ({
	meter: `${kind}_text_tokens`, kind, label: null, price: perMillion, per: 1_000_000, unit: "token", conditional,
});

function model(id: string, overrides: Partial<CompareViewModel> = {}): CompareViewModel {
	return {
		id, name: id, lab: { id: id.split("/")[0]!, name: id.split("/")[0]! }, status: "active",
		releaseDate: null, announcedDate: null, deprecationDate: null, retirementDate: null, knowledgeCutoff: null,
		licence: "Proprietary", inputTypes: ["text"], outputTypes: ["text"], contextWindow: null, maxOutput: null,
		features: { tools: null, structuredOutputs: null, reasoning: null, webSearch: null },
		pricing: null, providers: [], otherListings: [], subscriptionPlans: [],
		links: { apiReference: null, announcement: null, paper: null, weights: null, repository: null },
		...overrides,
	};
}

// Production standard-tier rows on the first-party routes, 21 Oct 2026.
const gpt5 = model("openai/gpt-5", {
	inputTypes: ["text", "image"],
	contextWindow: { tokens: 400_000, source: "model" },
	maxOutput: { tokens: 128_000, source: "model" },
	knowledgeCutoff: "2024-10-01",
	pricing: {
		provider: { id: "openai", name: "OpenAI", routed: true },
		tiers: {
			standard: [tokens("input", 1.25), tokens("output", 10), tokens("cacheRead", 0.125)],
			batch: [tokens("input", 0.625), tokens("output", 5)],
			priority: [tokens("input", 2.5), tokens("output", 20)],
		},
	},
});
const sonnet = model("anthropic/claude-sonnet-4.5", {
	contextWindow: { tokens: 200_000, source: "model" },
	maxOutput: { tokens: 64_000, source: "model" },
	knowledgeCutoff: "2025-01-01",
	pricing: {
		provider: { id: "anthropic", name: "Anthropic", routed: true },
		tiers: { standard: [tokens("input", 3), tokens("output", 15), tokens("cacheRead", 0.3), tokens("input", 6, true)] },
	},
});
const speech = model("eleven-labs/eleven-v3", {
	inputTypes: ["text"],
	outputTypes: ["audio"],
	pricing: {
		provider: { id: "elevenlabs", name: "ElevenLabs", routed: true },
		tiers: { standard: [{ meter: "input_characters", kind: "other", label: null, price: 0.1, per: 1000, unit: "character", conditional: false }] },
	},
});

describe("formatUsd", () => {
	it("reads zone-less catalogue dates as UTC", () => {
		expect(new Date(timeValue("2024-10-01T00:00:00")!).getUTCMonth()).toBe(9);
	});

	it("shows US dollars without a US prefix", () => {
		expect(formatUsd(1.25)).toBe("$1.25");
		expect(formatUsd(10)).toBe("$10.00");
		expect(formatUsd(0.125)).toBe("$0.125");
		expect(formatUsd(0.0625)).toBe("$0.0625");
		expect(formatUsd(12_345.6)).toBe("$12,346");
	});
});

describe("pricing", () => {
	it("reads standard text prices per million and skips conditional rows", () => {
		expect(tokenPrice(gpt5, "input")).toBe(1.25);
		expect(tokenPrice(sonnet, "input")).toBe(3);
		expect(tokenPrice(gpt5, "input", "batch")).toBe(0.625);
		expect(tokenPrice(sonnet, "input", "batch")).toBeNull();
	});

	it("uses a meter's base band when every row is conditional", () => {
		const astra = model("openai/gpt-6-astra", { pricing: { provider: { id: "openai", name: "OpenAI", routed: true }, tiers: {
			standard: [{ ...tokens("input", 10, true), condition: "input tokens ≤ 272K" }, { ...tokens("input", 20, true), condition: "input tokens > 272K" }, tokens("output", 50)],
		} } });
		expect(tokenPrice(astra, "input")).toBe(10);
		expect(extraBands(astra, "standard", priceRow(astra, "input")!).map((row) => [row.condition, row.price])).toEqual([["input tokens > 272K", 20]]);
		expect(tokenPrice(sonnet, "input")).toBe(3);
	});

	it("doesn't treat a per-character price as a token price", () => {
		expect(tokenPrice(speech, "input")).toBeNull();
		expect(priceRow(speech, "input")).toMatchObject({ meter: "input_characters", per: 1000 });
		expect(priceRow(speech, "output")).toBeNull();
		expect(requestCost(speech, TYPICAL_REQUEST)).toBeNull();
	});

	it("prices a typical request", () => {
		expect(requestCost(gpt5, TYPICAL_REQUEST)).toBeCloseTo(0.0075);
		expect(requestCost(sonnet, TYPICAL_REQUEST)).toBeCloseTo(0.0135);
		expect(requestCost(gpt5, { inputTokens: 1_000_000, outputTokens: 0, cachedShare: 0.5 })).toBeCloseTo(0.6875);
		// Batch has no cache-read row, so cached input falls back to the batch input price.
		expect(requestCost(gpt5, TYPICAL_REQUEST, "batch")).toBeCloseTo(0.00375);
	});

	it("prices the route and tier a reader picks", () => {
		const route = (id: string, input: number, tiers: Record<string, CompareViewPriceRow[]> | undefined) => ({
			id, name: id.toUpperCase(), input, output: null, cacheRead: null, contextWindow: null, maxOutput: null,
			tiers: Object.keys(tiers ?? {}), pricing: tiers, quantisation: null,
		});
		const opus = model("anthropic/claude-opus-5.5", {
			pricing: { provider: { id: "anthropic", name: "Anthropic", routed: true }, tiers: { standard: [tokens("input", 4)], batch: [tokens("input", 2)] } },
			providers: [
				route("anthropic", 4, { standard: [tokens("input", 4)], batch: [tokens("input", 2)] }),
				route("azure", 4.4, { standard: [tokens("input", 4.4)] }),
				// Cached before routes carried prices: can't be priced, so the headline route stays.
				route("stale", 5, undefined),
			],
		});
		expect(tokenPrice(applyRoute(opus, "azure"), "input")).toBe(4.4);
		expect(applyRoute(opus, "azure").pricing?.provider).toEqual({ id: "azure", name: "AZURE", routed: true });
		expect(applyRoute(opus, "stale")).toBe(opus);
		expect(applyRoute(opus, null)).toBe(opus);
		// Batch on the lab route; Azure only sells standard, so a batch choice falls back to it.
		expect(activeTier(opus, "batch")).toBe("batch");
		expect(activeTier(applyRoute(opus, "azure"), "batch")).toBe("standard");
		expect(tokenPrice(opus, "input", activeTier(opus, "batch"))).toBe(2);
	});

	it("orders tiers with the list price first", () => {
		expect(sortTiers(["priority", "standard", "zeta", "batch"])).toEqual(["standard", "batch", "priority", "zeta"]);
	});
});

describe("bestIndices", () => {
	it("marks the best value and ties", () => {
		expect([...bestIndices([1.25, 3, null], "lower")]).toEqual([0]);
		expect([...bestIndices([128_000, 128_000, 65_536], "higher")]).toEqual([0, 1]);
	});

	it("marks nothing when every model ties or only one has a value", () => {
		expect(bestIndices([5, 5], "higher").size).toBe(0);
		expect(bestIndices([5, null], "higher").size).toBe(0);
	});
});

describe("distinctDigits", () => {
	const compact = (value: number, digits: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: digits }).format(value);

	it("adds digits until different context windows read differently", () => {
		// Production, 27 Oct: GPT-6 Astra and Gemini 4 Argon both rendered as "1.05M".
		const values = [1_050_000, 200_000, 1_048_576];
		const digits = distinctDigits(values, compact);
		expect(digits).toBe(4);
		expect(values.map((value) => compact(value, digits))).toEqual(["1.05M", "200K", "1.049M"]);
	});

	it("keeps three digits when the values already read differently or truly tie", () => {
		expect(distinctDigits([400_000, 200_000, null], compact)).toBe(3);
		expect(distinctDigits([1_048_576, 1_048_576], compact)).toBe(3);
	});
});

describe("doSameJob", () => {
	it("separates chat from speech", () => {
		expect(doSameJob([gpt5, sonnet])).toBe(true);
		expect(doSameJob([gpt5, speech])).toBe(false);
	});
});

const eci: CompareViewBenchmark = {
	id: "epoch-capabilities-index", name: "Epoch Capabilities Index", category: "general", higherIsBetter: true,
	type: "numerical", source: "epoch", link: null,
	results: {
		"openai/gpt-6-astra": [{ score: 166.41, variant: null, effort: null, ci: [163.35, 171.23], selfReported: false, sourceLink: null }],
		"anthropic/claude-opus-5.5": [{ score: 166.82, variant: null, effort: null, ci: [163.54, 170.99], selfReported: false, sourceLink: null }],
		"google/gemini-4-argon": [{ score: 164.56, variant: null, effort: null, ci: [161.67, 168.7], selfReported: false, sourceLink: null }],
	},
};
const aa = (scores: Record<string, Partial<Record<string, number>>>): CompareViewBenchmark => ({
	id: "aa-intelligence-index-v4", name: "Intelligence Index", category: "general", higherIsBetter: true,
	type: "numerical", source: "artificial-analysis", link: null,
	results: Object.fromEntries(Object.entries(scores).map(([id, byEffort]) => [id, Object.entries(byEffort).map(([effort, score]) => ({
		score: score!, variant: effort, effort: effort as never, ci: null, selfReported: false, sourceLink: null,
	}))])),
});
const flagshipAa = aa({
	"openai/gpt-6-astra": { low: 45.8, medium: 49.6, high: 50.9, xhigh: 52.4, max: 52.7 },
	"anthropic/claude-opus-5.5": { low: 42.3, medium: 51.2, high: 53.6, xhigh: 56, max: 57.6 },
	"google/gemini-4-argon": { high: 52.6 },
});
const flagshipIds = ["openai/gpt-6-astra", "anthropic/claude-opus-5.5", "google/gemini-4-argon"];

describe("benchmark efforts", () => {
	it("defaults to the highest level every model reports", () => {
		const levels = effortLevels([flagshipAa, eci], flagshipIds);
		expect(levels).toEqual([
			{ effort: "low", models: 2 }, { effort: "medium", models: 2 }, { effort: "high", models: 3 },
			{ effort: "xhigh", models: 2 }, { effort: "max", models: 2 },
		]);
		expect(defaultEffort(levels)).toBe("high");
	});

	it("compares like with like and says when a model wasn't tested at that level", () => {
		expect(pickResult(flagshipAa, "anthropic/claude-opus-5.5", "high")).toMatchObject({ kind: "result", result: { score: 53.6 } });
		expect(pickResult(flagshipAa, "google/gemini-4-argon", "max")).toEqual({ kind: "notAtEffort" });
		expect(pickResult(eci, "google/gemini-4-argon", "max")).toMatchObject({ kind: "result", result: { score: 164.56 } });
		expect(pickResult(eci, "openai/gpt-5", "high")).toEqual({ kind: "none" });
	});

	it("never hides a lab result behind the effort switch", () => {
		const lab: CompareViewBenchmark = { ...eci, id: "elimination-game", source: "independent", results: {
			"openai/gpt-5": [{ score: 5.968, variant: "Medium reasoning", effort: "medium", ci: null, selfReported: false, sourceLink: null }],
		} };
		expect(pickResult(lab, "openai/gpt-5", "high")).toMatchObject({ kind: "result", result: { score: 5.968 } });
		expect(effortLevels([lab], ["openai/gpt-5"])).toEqual([]);
	});

	it("marks no winner when a lab reported any of the scores", () => {
		// Production, 2 Nov: each lab's own launch numbers, with different versions and task sets.
		const lab = (score: number, variant: string | null) => ({ score, variant, effort: null, ci: null, selfReported: true, sourceLink: null });
		const agentsLastExam: CompareViewBenchmark = { ...eci, id: "agents-last-exam", source: "lab", results: {
			"openai/gpt-6-astra": [lab(59.3, null), lab(58.3, "xhigh")],
			"google/gemini-4-argon": [lab(39.5, "Pass rate")],
		} };
		const picks = flagshipIds.map((id) => pickResult(agentsLastExam, id, "high"));
		expect(picks.map((picked) => (picked.kind === "result" ? picked.result.score : picked.kind))).toEqual([59.3, "none", 39.5]);
		expect(bestBenchmarkIndices(picks, true).size).toBe(0);
	});

	it("still marks the best independent result", () => {
		const picks = flagshipIds.map((id) => pickResult(flagshipAa, id, "high"));
		expect([...bestBenchmarkIndices(picks, true)]).toEqual([1]);
		expect([...bestBenchmarkIndices(picks, false)]).toEqual([0]);
	});

	it("keeps benchmarks two models share and sets aside the rest", () => {
		const single = { ...eci, id: "gpqa", name: "GPQA Diamond", source: "lab" as const, results: { "openai/gpt-6-astra": eci.results["openai/gpt-6-astra"]! } };
		const groups = groupBenchmarks([single, flagshipAa, eci], flagshipIds);
		expect(groups.shared.map((benchmark) => benchmark.id)).toEqual(["epoch-capabilities-index", "aa-intelligence-index-v4"]);
		expect(groups.single.map((benchmark) => benchmark.id)).toEqual(["gpqa"]);
		expect(groupBenchmarks([single], ["openai/gpt-6-astra"]).shared).toHaveLength(1);
	});
});

describe("buildVerdicts", () => {
	it("calls overlapping capability intervals a tie instead of a win", () => {
		const models = flagshipIds.map((id) => model(id));
		const verdicts = buildVerdicts(models, {}, [eci]);
		expect(verdicts.capabilityTie).toBe(true);
		expect(Object.values(verdicts.byModel).flat().some((reason) => reason.type === "topCapability")).toBe(false);
	});

	it("gives each model the rows it alone wins", () => {
		const verdicts = buildVerdicts([gpt5, sonnet], {
			"openai/gpt-5": { periodDays: 30, tokens30d: 0, totalRequests: 0, latencyP50Ms30m: null, throughputP50TokPerSec30m: null },
			"anthropic/claude-sonnet-4.5": { periodDays: 30, tokens30d: 0, totalRequests: 0, latencyP50Ms30m: 3400, throughputP50TokPerSec30m: 114 },
		}, []);
		expect(verdicts.byModel["openai/gpt-5"]).toEqual([
			{ type: "cheapest", value: expect.closeTo(0.0075) },
			{ type: "largestContext", value: 400_000 },
			{ type: "onlyInput", modalities: ["image"] },
		]);
		expect(verdicts.byModel["anthropic/claude-sonnet-4.5"]).toEqual([{ type: "latestCutoff", value: "2025-01-01" }]);
	});

	it("doesn't pick a cheapest model across different jobs", () => {
		const verdicts = buildVerdicts([gpt5, speech], {}, []);
		expect(Object.values(verdicts.byModel).flat().some((reason) => reason.type === "cheapest")).toBe(false);
	});
});

describe("visibleOnPhone", () => {
	it("shows two models per page", () => {
		expect([0, 1, 2, 3].map((index) => visibleOnPhone(index, 1))).toEqual([false, false, true, true]);
	});
});

describe("describeCondition", () => {
	const words = {
		field: (field: string) => ({ input_tokens: "Input", resolution: "Resolution", mode: "Mode", draft: "Draft", seconds: "Duration", audio: "Audio" } as Record<string, string>)[field] ?? field,
		is: (field: string, value: string) => `${field}: ${value}`,
		isNot: (field: string, value: string) => `${field}: not ${value}`,
		on: "on",
		off: "off",
		tokens: (value: number) => `${value / 1000}K`,
		number: (value: number) => value.toLocaleString("en-US"),
		seconds: (value: number) => `${value} sec`,
	};

	// Shapes taken from production price rules on 3 Nov.
	it("reads token limits, options and flags the way a reader would write them", () => {
		expect(describeCondition({ field: "input_tokens", op: "gt", value: 272_000 }, words)).toBe("Input > 272K");
		expect(describeCondition({ field: "input_tokens", op: "gt", value: 272_001 }, words)).toBe("Input > 272,001");
		expect(describeCondition({ field: "resolution", op: "eq", value: "1080P" }, words)).toBe("Resolution: 1080p");
		expect(describeCondition({ field: "mode", op: "ne", value: "v2v" }, words)).toBe("Mode: not v2v");
		expect(describeCondition({ field: "mode", op: "eq", value: "image_to_video" }, words)).toBe("Mode: image to video");
		expect(describeCondition({ field: "draft", op: "eq", value: 1 }, words)).toBe("Draft: on");
		expect(describeCondition({ field: "draft", op: "eq", value: 0 }, words)).toBe("Draft: off");
		expect(describeCondition({ field: "audio", op: "eq", value: false }, words)).toBe("Audio: off");
		expect(describeCondition({ field: "resolution", op: "eq", value: "fhd" }, words)).toBe("Resolution: FHD");
		// Claude Opus 5.5's US-only price rows.
		expect(describeCondition({ field: "inference_geo", op: "eq", value: "us" }, words)).toBe("inference_geo: US");
	});

	it("keeps one short name for each option in a list", () => {
		expect(describeCondition({ field: "resolution", op: "in", value: ["480P", "480p", "854x480", "480x854", "854*480"] }, words)).toBe("Resolution: 480p");
		expect(describeCondition({ field: "resolution", op: "in", value: ["480p", "720p"] }, words)).toBe("Resolution: 480p / 720p");
		expect(describeCondition({ field: "resolution", op: "in", value: ["1024x1792", "1792x1024"] }, words)).toBe("Resolution: 1024x1792 / 1792x1024");
		expect(describeCondition({ field: "seconds", op: "in", value: [10] }, words)).toBe("Duration: 10 sec");
	});
});

describe("parseLegacyCondition", () => {
	const words = {
		field: (field: string) => ({ input_tokens: "Input", resolution: "Resolution", mode: "Mode", draft: "Draft", seconds: "Duration" } as Record<string, string>)[field] ?? field,
		is: (field: string, value: string) => `${field}: ${value}`,
		isNot: (field: string, value: string) => `${field}: not ${value}`,
		on: "on",
		off: "off",
		tokens: (value: number) => `${value / 1000}K`,
		number: (value: number) => value.toLocaleString("en-US"),
		seconds: (value: number) => `${value} sec`,
	};
	const read = (text: string) => parseLegacyCondition(text)!.map((condition) => describeCondition(condition, words)).join(" · ");

	// The text the deployed web API sent for Grok Imagine Video 1.5 and FLUX 3 Video on 3 Nov.
	it("reads the deployed API's condition text back into tidy labels", () => {
		expect(read("video params.resolution = 480p")).toBe("Resolution: 480p");
		expect(read("video params.mode ne v2v and video params.draft = 1")).toBe("Mode: not v2v · Draft: on");
		expect(read("video params.mode ne v2v and video params.resolution = hd and video params.draft = 0")).toBe("Mode: not v2v · Resolution: HD · Draft: off");
		expect(read("input tokens > 272K")).toBe("Input > 272K");
		expect(read("video params.resolution in 480P,480p,854x480")).toBe("Resolution: 480p");
		expect(read("video params.seconds in 10")).toBe("Duration: 10 sec");
	});

	it("leaves text it can't read alone", () => {
		expect(parseLegacyCondition("draft")).toBeNull();
		expect(parseLegacyCondition(null)).toBeNull();
	});
});

describe("providerLines", () => {
	const route = (id: string, input: number) => ({ id, name: id.toUpperCase(), input, output: input * 4, cacheRead: null, contextWindow: null, maxOutput: null, tiers: ["standard"], quantisation: null });

	it("lists each provider once with every model's route, shared providers first, then the cheapest", () => {
		const glm = model("z-ai/glm-5.2", { providers: [route("ambient", 0.6), route("deepinfra", 0.75), route("wafer", 0.8)] });
		const kimi = model("moonshotai/kimi-k3", { providers: [route("wafer", 0.5), route("deepinfra", 0.9)] });
		const lines = providerLines([glm, kimi]);
		expect(lines.map((line) => [line.id, line.routes.map((entry) => entry?.input ?? null)])).toEqual([
			["wafer", [0.8, 0.5]],
			["deepinfra", [0.75, 0.9]],
			["ambient", [0.6, null]],
		]);
	});
});
