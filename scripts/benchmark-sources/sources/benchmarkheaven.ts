import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Benchmark Heaven republishes independent maintainers' leaderboards under one schema (public API, see API.md in
 * github.com/fstandhartinger/model-market-comparison). Only boards with no first-party data file read elsewhere in this
 * repo are taken from it, and only rows Benchmark Heaven marks as measured or derived from the maintainer's board:
 * vendor self-reports are skipped, because these results are stored as independent.
 */
const ORIGIN = "https://benchmarkheaven.com";
const DATASET = `${ORIGIN}/api/dataset`;

type Observation = {
	benchmark_id: string;
	value: number;
	unit?: string;
	basis?: string;
	protocol?: string | null;
	subject: { name: string; variant?: string | null; harness?: string | null };
	source?: { url?: string; published_at?: string | null; retrieved_at?: string | null };
};
export type BenchmarkHeavenDataset = { generated_at?: string; benchmark_results: { observations: Observation[] } };

/**
 * `family` is the registry id before "::". Unpinned boards are versioned by date ("family::snapshot-<date>" or
 * "family::<date>") and the newest is read; `version` pins a board whose version is part of its identity.
 */
type Board = BenchmarkDefinition & { family: string; version?: string; maintainer: string; cleanLabel?: (label: string) => string };

const pct = { type: "percentage", unit: "%" } as const;
const pts = (unit: string) => ({ type: "numerical", unit }) as const;

/** LongBench v2 labels carry a 🧠 marker and the developer: "Gemini-2.5-Pro 🧠 Google". */
const withoutDeveloper = (label: string) => label.replace(/\s*\p{Extended_Pictographic}.*$/u, "").replace(/\s+(Google|Alibaba|DeepSeek|OpenAI|Anthropic|Meta|Mistral|Zhipu|Moonshot|xAI|THUDM|Tencent|MiniMax|Cohere|Microsoft|NVIDIA|01\.AI)$/i, "").trim();
/** RULER: "Qwen2.5-14B-Instruct-1M* (14B)". */
const withoutSize = (label: string) => label.replace(/\*/g, "").replace(/\s*\([\d.]+B(?:\/[\d.]+B)?\)\s*$/i, "").trim();
/** VitaBench groups rows: "Thinking Models|o3 (high)". */
const withoutGroup = (label: string) => label.replace(/^[^|]*\|/, "").trim();

const BOARDS: Board[] = [
	{ family: "apprenticebench-api", id: "apprenticebench-api", name: "ApprenticeBench (API)", url: "https://apprenticebench.com/", maintainer: "NeoCognition", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes the same 100 sequential accounts-payable tasks in the Odoo ERP with diminishing mentoring, through application API calls. Cumulative success rate." },
	{ family: "apprenticebench-cua", id: "apprenticebench-cua", name: "ApprenticeBench (CUA)", url: "https://apprenticebench.com/", maintainer: "NeoCognition", category: "agents", higherIsBetter: true, ...pct, description: "A computer-use agent operates the Odoo ERP through its screens across 100 sequential accounts-payable tasks with diminishing mentoring. Cumulative success rate." },
	{ family: "bu-bench-v1", id: "bu-bench-v1", name: "BU Bench V1", url: "https://github.com/browser-use/benchmark", maintainer: "Browser Use", category: "agents", higherIsBetter: true, ...pct, description: "A browser agent completes 100 hand-selected web tasks: page-interaction challenges plus tasks drawn from WebBench, Mind2Web 2, GAIA and BrowseComp. Task success rate." },
	{ family: "context-arena-mrcr-v2", version: "8-needle", id: "context-arena-mrcr-v2-8-needle", name: "Context Arena MRCR v2 (8-needle)", url: "https://contextarena.ai/", maintainer: "Context Arena (Dillon Uzar)", category: "long_context", higherIsBetter: true, ...pct, description: "The model must find and reproduce the right one of eight near-identical earlier replies hidden in a long conversation. Mean score over the 8k–128k token bins." },
	{ family: "gso", version: "opt1-102", id: "gso", name: "GSO", url: "https://gso-bench.github.io/", maintainer: "GSO team (UC Berkeley)", category: "code", higherIsBetter: true, ...pct, description: "An agent gets a real codebase and a performance test and must match an expert developer's optimization; 102 tasks across 10 codebases and 5 languages. Opt@1: share of tasks where one attempt reaches at least 95% of the human speedup and passes the tests." },
	{ family: "hyper-tau-bench", version: "release-v1", id: "hyper-tau-bench", name: "τ^τ-bench (Hyper-τ)", url: "https://github.com/sierra-research/hyper-tau-bench", maintainer: "Sierra", category: "agents", higherIsBetter: true, ...pct, description: "A coding agent builds a customer-service agent from policies, transcripts, recordings and a client API; that agent then serves simulated customers. Mean reward across the 53 release tasks." },
	{ family: "japanese-rp-bench-aratako", id: "japanese-rp-bench", name: "Japanese-RP-Bench", url: "https://github.com/Aratako/Japanese-RP-Bench", maintainer: "Aratako", category: "creativity", higherIsBetter: true, ...pts("points"), description: "Ten-turn Japanese roleplay dialogues between two models, scored by four LLM judges on eight criteria. Overall average (1–5)." },
	{ family: "japanese-rp-bench-tegnike", version: "2", id: "japanese-rp-bench-v2", name: "Japanese-RP-Bench v2", url: "https://github.com/tegnike/Japanese-RP-Bench", maintainer: "tegnike", category: "creativity", higherIsBetter: true, ...pts("points"), description: "Japanese roleplay scored for role fidelity, conversation quality, persona stability, robustness and recovery. Challenge RP summary: macro-average of the five criteria." },
	{ family: "longbench", version: "2", id: "longbench-v2", name: "LongBench v2", url: "https://longbench2.github.io/", maintainer: "THUDM (Tsinghua University)", category: "long_context", higherIsBetter: true, ...pct, cleanLabel: withoutDeveloper, description: "503 multiple-choice questions over contexts from 8k to 2M words across six task categories. Accuracy." },
	{ family: "pingpong-english", version: "2", id: "pingpong-english-v2", name: "PingPong (English) v2", url: "https://ilyagusev.github.io/ping_pong_bench/en_v2", maintainer: "Ilya Gusev", category: "creativity", higherIsBetter: true, ...pts("points"), description: "An LLM plays a user in multi-turn roleplay with the model, and LLM judges rate how in-character, entertaining and fluent the model is. Unadjusted average score." },
	{ family: "react-native-evals", version: "91-evals", id: "react-native-evals", name: "React Native Evals", url: "https://rn-evals.vercel.app/", maintainer: "Callstack", category: "code", higherIsBetter: true, ...pct, description: "Coding agents build React Native app features across 91 evals; an LLM judge checks the generated code against each task's written requirements. Share of requirements met." },
	{ family: "realswe", id: "real-swe", name: "Real-SWE", url: "https://withspecific.com/benchmarks/real-swe", maintainer: "Specific Labs", category: "code", higherIsBetter: true, ...pct, description: "Coding agents resolve tasks in private, licensed enterprise codebases. Resolution rate: pass@1 averaged over eight runs per task." },
	{ family: "researchclawbench", version: "40-tasks", id: "researchclawbench", name: "ResearchClawBench", url: "https://internscience.github.io/ResearchClawBench-Home/", maintainer: "InternScience", category: "science", higherIsBetter: true, ...pts("points"), description: "An agent gets the data and literature behind a published paper, with the paper hidden, and redoes the research end to end. An LLM reviewer grades each report against an expert rubric (0–100; 50 matches the paper)." },
	{ family: "rp-bench-community", id: "rp-bench-community", name: "RP-Bench Community Elo", url: "https://huggingface.co/spaces/lazyweasel/rp-bench-leaderboard", maintainer: "lazyweasel", category: "creativity", higherIsBetter: true, ...pts("Elo"), description: "Roleplay outputs compared by community votes. Bayesian community Elo." },
	{ family: "rsi-exam", version: "0.1", id: "rsi-exam", name: "RSI-Exam 0.1", url: "https://rsi-exam.ai/", maintainer: "RSI-Exam team (UNC Chapel Hill)", category: "science", higherIsBetter: true, ...pts("score"), description: "An agent spends a long, budgeted run improving an inherited research method on a visible split; its submission is re-run once on a sealed hidden split. Mean normalised hidden-set score (0–1)." },
	{ family: "ruler", id: "ruler", name: "RULER", url: "https://github.com/NVIDIA/RULER", maintainer: "NVIDIA", category: "long_context", higherIsBetter: true, ...pct, cleanLabel: withoutSize, description: "13 synthetic long-context tasks in four categories at lengths from 4K to 128K tokens. Average score across lengths." },
	{ family: "slop-index", id: "slop-index", name: "The Slop Index", url: "https://theslopindex.com/leaderboard", maintainer: "The Slop Index", category: "creativity", higherIsBetter: false, ...pts("points"), description: "How much a model's writing reads like chatbot slop against pre-AI human writing: 40% live arena votes plus 15% each for concision, templating, rhythm and tells. 0–100; lower is better." },
	{ family: "slopbench", id: "slopbench", name: "SlopBench", url: "https://slop-bench.vercel.app/", maintainer: "Dan Cleary", category: "creativity", higherIsBetter: false, ...pct, description: "53 chat-style prompts, checked deterministically for classic AI slop patterns. Share of responses with at least one hit; lower is better." },
	{ family: "toolathlon", version: "pre-verified", id: "toolathlon", name: "Toolathlon (original)", url: "https://toolathlon.xyz/docs/leaderboard", maintainer: "HKUST NLP", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes 108 real-world tool-use tasks across MCP servers and local toolkits, each graded by checking the resulting state. Pass@1 on the archived pre-Verified board." },
	{ family: "toolathlon-verified", id: "toolathlon-verified", name: "Toolathlon-Verified", url: "https://toolathlon.xyz/docs/leaderboard", maintainer: "HKUST NLP", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes 108 real-world tool-use tasks across 32 MCP servers and 7 local toolkits, each graded by checking the resulting state. Pass@1, mean over three runs." },
	{ family: "vitabench", id: "vitabench", name: "VitaBench", url: "https://vitabench.github.io/", maintainer: "Meituan LongCat team", category: "agents", higherIsBetter: true, ...pct, cleanLabel: withoutGroup, description: "An agent handles real-life errands spanning food delivery, restaurant bookings and travel with 66 tools and a customer whose wishes change. Cross-scenario Avg@4 on the 100 cross-scenario tasks." },
	{ family: "vulcanbench-frontier", version: "4", id: "vulcanbench-frontier-v4", name: "VulcanBench Frontier v4", url: "https://vulcanbench.com/leaderboard.html", maintainer: "Morgan Linton", category: "code", higherIsBetter: true, ...pct, description: "23 tasks where the model repairs a replacement implementation of a legacy program until hidden tests confirm it reproduces the program's real behaviour. Combined score of hidden tests, lint, security analysis and judged code quality." },
	{ family: "mcpmark", version: "verified", id: "mcpmark-verified", name: "MCPMark Verified", url: "https://mcpmark.ai/leaderboard/verified", maintainer: "EVAL SYS", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes multi-step tasks through MCP servers for Notion, GitHub, a filesystem, Postgres and a browser, each checked by the task's own verification script. Pass@1 on the 127 Verified tasks." },
	{ family: "mls-bench-lite", version: "30-tasks", id: "mls-bench-lite", name: "MLS-Bench-Lite", url: "https://mls-bench.com/leaderboard", maintainer: "MLS-Bench authors", category: "science", higherIsBetter: true, ...pts("points"), description: "An agent gets an ML research scaffold with strong baselines and must invent one algorithmic change whose gain holds across settings. Normalized task metric averaged over the 30 Lite tasks." },
	{ family: "charxiv-reasoning", version: "val-v1.0", id: "charxiv-reasoning", name: "CharXiv Reasoning", url: "https://charxiv.github.io/#leaderboard", maintainer: "Princeton Language and Intelligence", category: "multimodal", higherIsBetter: true, ...pct, description: "Reasoning questions over real charts from scientific papers, one per chart. Accuracy on the 1,000 validation questions, graded by GPT-4o." },
	{ family: "interfaze-sob", version: "text-image-audio", id: "interfaze-sob", name: "SOB (Structured Output Benchmark)", url: "https://interfaze.ai/leaderboards/structured-output-benchmark", maintainer: "Interfaze", category: "general", higherIsBetter: true, ...pct, description: "The model fills a JSON Schema from text, OCR-ed documents and meeting transcripts. Schema-difficulty-weighted average of seven metrics, led by exact value accuracy." },
	{ family: "surge-gdp-pdf", version: "100-tasks", id: "gdp-pdf", name: "GDP.pdf", url: "https://surgehq.ai/benchmarks/gdp-pdf", maintainer: "Surge AI", category: "multimodal", higherIsBetter: true, ...pct, description: "The model answers professional questions about real work PDFs such as manuals, wiring diagrams, filings and forms. All-pass rate: share of responses meeting every expert rubric criterion over 100 tasks and five runs." },
	{ family: "eqbench-slop-score", id: "eqbench-slop-score", name: "Slop Score", url: "https://eqbench.com/slop-score.html", maintainer: "Sam Paech (EQ-Bench)", category: "creativity", higherIsBetter: false, ...pts("points"), description: "Writing from a standard prompt set, scored for overused slop words (60%), 'not x but y' contrasts (25%) and slop trigrams (15%). Lower is better." },
	{ family: "long-horizon-terminal-bench", version: "1.0", id: "long-horizon-terminal-bench", name: "Long-Horizon Terminal-Bench", url: "https://zli12321.github.io/LHTB/leaderboard.html", maintainer: "Tencent HY LLM Frontier", category: "agents", higherIsBetter: true, ...pts("score"), description: "Long terminal tasks run in the Terminus-2 agent. Mean task score (0–1)." },
];

const EFFORT_WORDS: Record<string, string> = { none: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", "extra-high": "xhigh", "extra high": "xhigh", max: "max" };
const NON_MODEL = /^(human|humans|random|baseline)\b|\bbaseline$|human-baseline/i;
const SNAPSHOT = /^snapshot-(\d{4}-\d{2}-\d{2})$/;

/**
 * Benchmark Heaven writes the setting into the name: "gpt-6-astra · Codex · max", "Fable 5.1 [claude code · max]",
 * "google/gemini-3.7-flash@reasoning=high". Returns the model part with the effort split out.
 */
export function splitHeavenLabel(name: string, harness?: string | null): { label: string; effort?: string; config?: string } {
	let effort: string | undefined;
	let config: string | undefined;
	let text = name.trim();
	const at = text.match(/@reasoning=([a-z-]+)$/i);
	if (at) {
		const setting = at[1].toLowerCase();
		effort = EFFORT_WORDS[setting];
		// "@reasoning=enabled" is a setting, not an effort level; keep it so it isn't merged with the default run.
		if (!effort) config = `reasoning ${setting}`;
		text = text.slice(0, at.index).trim();
	}
	const bracket = text.match(/\s*\[([^\]]*·[^\]]*)\]\s*$/);
	const parts = (bracket ? [text.slice(0, bracket.index), ...bracket[1].split("·")] : text.split("·")).map((part) => part.trim()).filter(Boolean);
	const model = parts.shift() ?? text;
	// The other parts are the effort and the harness; the observation carries the harness separately.
	for (const part of parts) effort ??= EFFORT_WORDS[part.toLowerCase()];
	return config ? { label: model, effort, config } : { label: model, effort };
}

/** Some boards publish several configurations per model (LongBench v2 "with CoT" / "without CoT"); the source row names it. */
export function protocolConfig(protocol: unknown): string | undefined {
	return typeof protocol === "string" ? protocol.match(/"configuration":"([^"]+)"/)?.[1]?.trim() || undefined : undefined;
}

export function parseBenchmarkHeaven(dataset: BenchmarkHeavenDataset): SourceObservation[] {
	const all = dataset?.benchmark_results?.observations;
	if (!Array.isArray(all)) throw new Error("Benchmark Heaven format changed: expected benchmark_results.observations[].");
	// Newest snapshot per family; pinned versions as written.
	const chosen = new Map<string, { registryId: string; date: string }>();
	for (const observation of all) {
		const [family, version = ""] = observation.benchmark_id.split("::");
		const board = BOARDS.find((candidate) => candidate.family === family);
		if (!board) continue;
		if (board.version && version !== board.version) continue;
		// Unpinned families are versioned by date ("snapshot-2026-09-10" or "2026-06-30"); the newest wins.
		const date = version.match(SNAPSHOT)?.[1] ?? version;
		const current = chosen.get(board.id);
		if (!current || date > current.date) chosen.set(board.id, { registryId: observation.benchmark_id, date });
	}
	const boardByRegistry = new Map([...chosen].map(([id, { registryId }]) => [registryId, BOARDS.find((board) => board.id === id)!]));
	const observations: SourceObservation[] = [];
	for (const observation of all) {
		const board = boardByRegistry.get(observation.benchmark_id);
		if (!board || observation.basis === "self_reported" || !Number.isFinite(observation.value)) continue;
		const { label: rawLabel, effort: labelEffort, config: labelConfig } = splitHeavenLabel(observation.subject.name, observation.subject.harness);
		const label = board.cleanLabel ? board.cleanLabel(rawLabel) : rawLabel;
		if (!label || NON_MODEL.test(label)) continue;
		const variant = observation.subject.variant?.toLowerCase().trim();
		const fraction = (observation.unit ?? "").toLowerCase() === "fraction";
		const sourceUrl = observation.source?.url;
		observations.push({
			benchmarkId: board.id,
			label,
			effort: (variant && EFFORT_WORDS[variant]) || labelEffort,
			harness: observation.subject.harness?.trim() || undefined,
			config: protocolConfig(observation.protocol) ?? labelConfig,
			value: fraction ? observation.value * 100 : observation.value,
			observedOn: (observation.source?.published_at || observation.source?.retrieved_at || dataset.generated_at)?.slice(0, 10),
			url: sourceUrl && !/benchmarkheaven|mintapis/.test(sourceUrl) ? sourceUrl : undefined,
			note: `published by ${board.maintainer}; collected by Benchmark Heaven`,
		});
	}
	return observations;
}

export const benchmarkHeaven: BenchmarkSource = {
	id: "benchmarkheaven",
	name: "Benchmark Heaven",
	publisher: "Benchmark Heaven",
	url: ORIGIN,
	attribution: "Benchmark Heaven (benchmarkheaven.com); each score belongs to the board's own maintainer",
	minRows: 500,
	benchmarks: BOARDS.map(({ family: _family, version: _version, maintainer: _maintainer, cleanLabel: _cleanLabel, ...definition }) => definition),
	async fetch(ctx) {
		return parseBenchmarkHeaven(await ctx.fetchJson<BenchmarkHeavenDataset>(DATASET));
	},
};
