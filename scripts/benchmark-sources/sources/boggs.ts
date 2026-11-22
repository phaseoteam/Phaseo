import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Jake Boggs' benchmark dashboard republishes ~140 leaderboards as one JSON file, each row linking to the board it came
 * from. Only the boards listed here are read from it: boards whose publisher another source reads directly (Artificial
 * Analysis, Epoch, Vals, Scale, MathArena, Terminal-Bench, OSWorld, ARC Prize, WeirdML, Andon Labs, ClockBench, …) are
 * left out so no score is stored twice, and so are boards read from Benchmark Heaven or a first-party file in this repo.
 */
const DATA = "https://boggs.tech/data/benchmark-dashboard.json";
const PAGE = "https://boggs.tech/posts/benchmarks/";

type DashBenchmark = { id: string; name: string; url?: string };
type DashResult = {
	benchmark_id: string;
	model: string;
	source_model?: string | null;
	raw_score: number;
	reported_score?: number | null;
	reasoning_effort?: string | null;
	reasoning_setting?: string | null;
	harness?: string | null;
	agent_harness?: string | null;
	agent?: string | null;
	source_url?: string | null;
};
export type BoggsDashboard = { generated_at?: string; benchmarks: DashBenchmark[]; results: DashResult[] };

/** `share`: the dashboard's 0–1 reported score, stored as a percent. `raw`: the board's own number (Elo, points, …). */
type Board = BenchmarkDefinition & { boggsId: string; publisher: string; scale: "share" | "raw" };

const pct = { type: "percentage", unit: "%", scale: "share" } as const;
const BOARDS: Board[] = [
	{ boggsId: "storebench", id: "storebench", name: "StoreBench", url: "https://www.afterquery.com/blog/storebench", publisher: "AfterQuery", category: "agents", higherIsBetter: true, ...pct, description: "An agent runs a simulated store through StoreBench's 11-task main suite. Mean composite score; human and scripted baselines are excluded." },
	{ boggsId: "bigym-2", id: "bigym-2", name: "BiGym 2.0", url: "https://bigym2.github.io/", publisher: "BiGym", category: "agents", higherIsBetter: true, ...pct, description: "The model controls a robot through BiGym 2.0's nine core tasks. Mean core-task success rate." },
	{ boggsId: "frontierml", id: "frontierml", name: "FrontierML", url: "https://www.frontierml.org/", publisher: "FrontierML", category: "science", higherIsBetter: true, ...pct, description: "A coding agent works on machine-learning research tasks under a fixed compute wallet. Mean normalized task score; each wallet setting is listed separately and the best one is kept." },
	{ boggsId: "tasteval", id: "tasteval", name: "TasteVal", url: "https://pzeroresearch.com/work/tasteval/", publisher: "P(0) Research", category: "science", type: "numerical", unit: "x", higherIsBetter: true, scale: "raw", description: "The model plans scientific experiments; TasteVal measures how efficiently it uses experimental compute. Compute multiplier relative to human experts (higher is better)." },
	{ boggsId: "hermes-bench", id: "hermes-bench", name: "Hermes Bench", url: "https://portal.nousresearch.com/bench", publisher: "Nous Research", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes 150 tasks in the Hermes Agent harness. Mean task reward." },
	{ boggsId: "sciuniverse", id: "sciuniverse", name: "SciUniverse", url: "https://c5r.net/sciuniverse", publisher: "SciUniverse", category: "science", higherIsBetter: true, ...pct, description: "Scientific tasks across 17 task families. Pass@1 averaged equally across the families." },
	{ boggsId: "nanogpt-speedrun", id: "nanogpt-speedrun", name: "NanoGPT Speedrun", url: "https://www.primeintellect.ai/research/nanogpt-speedrun", publisher: "Prime Intellect", category: "science", higherIsBetter: true, ...pct, description: "An agent tries to speed up NanoGPT training beyond the human speedrun baseline. Share of the gap to the human record closed by the best validated result." },
	{ boggsId: "ppbench", id: "ppbench", name: "PPBench", url: "https://ppbench.com/", publisher: "PPBench", category: "reasoning", higherIsBetter: true, ...pct, description: "PPBench puzzle tasks. Highest success rate the publisher lists for each model." },
	{ boggsId: "halluhard", id: "halluhard", name: "HalluHard", url: "https://halluhard.com/", publisher: "HalluHard", category: "knowledge", higherIsBetter: false, ...pct, description: "Hard questions that invite hallucination, answered without web search. Hallucination rate on the first turn; lower is better." },
	{ boggsId: "helm-lite", id: "helm-lite", name: "HELM Lite", url: "https://crfm.stanford.edu/helm/lite/latest/", publisher: "Stanford CRFM", category: "general", higherIsBetter: true, ...pct, description: "Stanford's HELM Lite suite of core scenarios. Mean win rate on the core-scenarios accuracy table." },
	{ boggsId: "arena-hard-auto", id: "arena-hard", name: "Arena-Hard-Auto v0.1", url: "https://github.com/lmarena/arena-hard-auto", publisher: "LMArena", category: "general", higherIsBetter: true, ...pct, description: "Hard user prompts answered by the model and judged against GPT-4-0314 by an LLM judge. Arena-Hard-Auto v0.1 score." },
	{ boggsId: "alpacaeval-2-verified", id: "alpacaeval-2.0", name: "AlpacaEval 2.0", url: "https://tatsu-lab.github.io/alpaca_eval/", publisher: "Tatsu Lab", category: "general", higherIsBetter: true, ...pct, description: "Instruction-following prompts judged pairwise against a reference model by an LLM judge. Length-controlled win rate from the verified leaderboard." },
	{ boggsId: "mathvista", id: "mathvista-mini", name: "MathVista (testmini)", url: "https://www.kaggle.com/benchmarks/open-benchmarks/mathvista", publisher: "Kaggle", category: "multimodal", higherIsBetter: true, ...pct, description: "Math questions about images, charts and figures. Accuracy on the testmini split as run on Kaggle; random chance is 17.9%." },
	{ boggsId: "benchmarks-bio", id: "benchmarks-bio", name: "benchmarks.bio Expected Performance", url: "https://benchmarks.bio/", publisher: "benchmarks.bio", category: "science", higherIsBetter: true, ...pct, description: "Biology evaluations gathered by benchmarks.bio. Mean IRT-predicted pass rate across the evaluations, excluding refusal." },
	{ boggsId: "opus-magnum-bench", id: "opus-magnum-bench", name: "Opus Magnum Bench", url: "https://opusmagnumbench.com/", publisher: "Opus Magnum Bench", category: "reasoning", higherIsBetter: true, ...pct, description: "The model solves 36 puzzles from the game Opus Magnum. Mean best reward normalized to human solutions." },
	{ boggsId: "olam-poker-elo", id: "olam-poker-elo", name: "Olam Poker Elo", url: "https://olamlabs.ai/evaluations/poker/elo", publisher: "Olam Labs", category: "reasoning", type: "numerical", unit: "Elo", higherIsBetter: true, scale: "raw", description: "Models play multi-agent social poker against each other. Bradley-Terry Elo rating; human players are excluded." },
	{ boggsId: "cadbench", id: "cadbench", name: "CADBench", url: "https://www.seldon.global/blog/cadbench", publisher: "Seldon", category: "agents", higherIsBetter: true, ...pct, description: "The model produces CAD designs that a verifier checks. Mean verifier score." },
	{ boggsId: "cheatbench", id: "cheatbench", name: "CheatBench", url: "https://www.cheatbench.ai/", publisher: "CheatBench", category: "safety", higherIsBetter: false, ...pct, description: "A coding agent gets tasks where cheating is possible. Share of runs with a cheating attempt; lower is better." },
	{ boggsId: "game-arena", id: "kaggle-game-arena", name: "Kaggle Game Arena", url: "https://www.kaggle.com/benchmarks/kaggle/game-arena/versions/1", publisher: "Kaggle", category: "reasoning", type: "numerical", unit: "rating", higherIsBetter: true, scale: "raw", description: "Models play strategic games against each other on Kaggle. Pooled Bradley-Terry rating across the games." },
	{ boggsId: "remote-labor-index", id: "remote-labor-index", name: "Remote Labor Index", url: "https://www.remotelabor.ai/", publisher: "Center for AI Safety", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes real paid remote-work projects. Automation rate: share of projects delivered at an acceptable standard." },
	{ boggsId: "job-bench", id: "jobbench", name: "JobBench", url: "https://job-bench.github.io/", publisher: "JobBench", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes job tasks in the OpenCode harness. Weighted score." },
	{ boggsId: "perception-bench", id: "perceptionbench", name: "PerceptionBench", url: "https://www.kimi.com/blog/perception-bench", publisher: "Moonshot AI", category: "multimodal", higherIsBetter: true, ...pct, description: "Atomic visual-perception questions about images. Overall accuracy." },
	{ boggsId: "maze-bench", id: "maze-bench", name: "MazeBench", url: "https://mazebench.com/leaderboard/ai", publisher: "MazeBench", category: "agents", higherIsBetter: true, ...pct, description: "An agent explores ASCII mazes with tools to collect gems. Share of the 100 gems collected." },
	{ boggsId: "gamedevbench", id: "gamedevbench", name: "GameDevBench", url: "https://waynechi.com/gamedevbench/", publisher: "GameDevBench", category: "code", higherIsBetter: true, ...pct, description: "A coding agent completes 333 game-development tasks. Pass@1 across all tasks." },
	{ boggsId: "production-simulation", id: "production-simulation", name: "Production Simulation", url: "https://www.haladir.com/blog/production-simulation", publisher: "Haladir", category: "agents", higherIsBetter: true, ...pct, description: "The model plans production across twenty simulated manufacturing scenarios. Mean normalized scenario score." },
	{ boggsId: "scbench", id: "slopcodebench", name: "SlopCodeBench", url: "https://www.scbench.ai/leaderboard", publisher: "SlopCodeBench", category: "code", higherIsBetter: true, ...pct, description: "A coding agent extends a program across successive checkpoints. Share of checkpoints solved in isolation (Iso Solve), best published version per model." },
	{ boggsId: "gba-eval", id: "gba-eval", name: "GBA Eval", url: "https://gbaeval.com/", publisher: "GBA Eval", category: "code", higherIsBetter: true, ...pct, description: "The model builds a Game Boy Advance emulator. Overall emulator score." },
	{ boggsId: "senior-swe-bench", id: "senior-swe-bench", name: "Senior SWE-Bench", url: "https://senior-swe-bench.snorkel.ai/agents", publisher: "Snorkel AI", category: "code", higherIsBetter: true, ...pct, description: "Software engineering tasks solved with Mini-SWE-Agent and graded for both correctness and taste. Tasteful solve rate (pass@1)." },
	{ boggsId: "ale-bench", id: "ale-bench", name: "ALE-Bench", url: "https://sakanaai.github.io/ALE-Bench-Leaderboard/", publisher: "Sakana AI", category: "code", type: "numerical", unit: "points", higherIsBetter: true, scale: "raw", description: "Hard optimization problems from AtCoder Heuristic Contests, solved by writing code. Best all-scenario mean performance rating." },
	{ boggsId: "edge-bench", id: "edge-bench", name: "EdgeBench", url: "https://edge-bench.org/", publisher: "EdgeBench", category: "agents", higherIsBetter: true, ...pct, description: "An agent learns an environment over a long horizon. Overall score at the 12-hour horizon." },
	{ boggsId: "dayjob-healthcare", id: "dayjob-healthcare", name: "DAYJOB: Healthcare", url: "https://surgehq.ai/benchmarks/dayjob-healthcare", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "The model completes professional healthcare assignments graded against expert rubrics. Success rate." },
	{ boggsId: "dayjob-finance", id: "dayjob-finance", name: "DAYJOB: Finance", url: "https://surgehq.ai/benchmarks/dayjob-finance", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "The model completes professional finance assignments graded against expert rubrics. Success rate." },
	{ boggsId: "dayjob-tax", id: "dayjob-tax", name: "DAYJOB: Tax", url: "https://surgehq.ai/benchmarks/dayjob-tax", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "The model completes 50 professional tax assignments graded against expert rubrics. Share of attempts that clear the 95% rubric threshold." },
	{ boggsId: "complex-constraints", id: "complex-constraints", name: "ComplexConstraints", url: "https://surgehq.ai/benchmarks/complex-constraints", publisher: "Surge AI", category: "reasoning", higherIsBetter: true, ...pct, description: "Prompts with many interlocking constraints the answer must satisfy. Leaderboard score." },
	{ boggsId: "gdp-xlsx", id: "gdp-xlsx", name: "GDP.xlsx", url: "https://surgehq.ai/benchmarks/gdp-xlsx", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "Professional spreadsheet tasks graded against expert rubrics. Leaderboard score." },
	{ boggsId: "handbook", id: "handbook-md-agents", name: "HANDBOOK.md Agents", url: "https://surgehq.ai/benchmarks/handbook", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "An agent follows an enterprise policy handbook while working through MCP tools. Leaderboard score." },
	{ boggsId: "enterprisebench-corecraft", id: "enterprisebench-corecraft", name: "EnterpriseBench CoreCraft", url: "https://surgehq.ai/benchmarks/enterprisebench-corecraft", publisher: "Surge AI", category: "agents", higherIsBetter: true, ...pct, description: "An agent completes enterprise tasks in a simulated company. Leaderboard score." },
	{ boggsId: "riemann-bench", id: "riemannbench", name: "Riemann-Bench", url: "https://surgehq.ai/benchmarks/riemann-bench", publisher: "Surge AI", category: "math", higherIsBetter: true, ...pct, description: "Extremely hard research-level math problems. Leaderboard score." },
	{ boggsId: "itsm-bench", id: "itsm-bench", name: "ITSMBench", url: "https://simulation.ressl.ai/benchmarks/atomicwork/itbench", publisher: "Ressl AI", category: "agents", higherIsBetter: true, ...pct, description: "An agent works 89 enterprise IT service-management tasks. Pass@1." },
	{ boggsId: "frontier-challenge", id: "frontier-challenge", name: "FrontierChallenge", url: "https://apodexai.github.io/FrontierAgent/benchmarks/FrontierChallenge/", publisher: "Apodex AI", category: "science", higherIsBetter: true, ...pct, description: "An agent completes 97 scientific workflow tasks. Pass rate." },
	{ boggsId: "autoresearch-exam", id: "autoresearch-exam", name: "AutoResearchExam", url: "https://benchmarks.bespokelabs.ai/autoresearchexam/", publisher: "Bespoke Labs", category: "science", type: "numerical", unit: "AUARC", higherIsBetter: true, scale: "raw", description: "An agent runs 24-hour research tasks and is scored on a hidden test set. Mean hidden-test AUARC (0–1)." },
	{ boggsId: "biopharma-bench", id: "biopharma-bench", name: "Biopharma Bench v0.1", url: "https://eval.raycaster.ai/benchmarks/biopharma-bench/", publisher: "Raycaster", category: "science", higherIsBetter: true, ...pct, description: "The model completes 71 regulated biopharma workflows. Mean task criteria score." },
	{ boggsId: "cad-arena", id: "cad-arena", name: "CAD Arena", url: "https://normal.ai/leaderboard/cad-arena", publisher: "Normal Computing", category: "agents", higherIsBetter: true, ...pct, description: "An agent builds CAD models across several CAD platforms. Mean CAD Arena score across platforms." },
	{ boggsId: "ple-bench", id: "ple-bench", name: "PLE-Bench", url: "https://ple-bench.com/leaderboard", publisher: "PLE-Bench", category: "science", higherIsBetter: true, ...pct, description: "An agent works PLE-Bench tasks and is graded against rubrics on a hidden test set. Mean rubric score; each harness is listed separately." },
];

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const NON_MODEL = /\b(human|humans|baseline|random|oracle|ensemble|expert panel)\b/i;

/** The effort the dashboard states for a row, from its reasoning field or the publisher label's last bracket. */
function statedEffort(row: DashResult): string | undefined {
	for (const value of [row.reasoning_effort, row.reasoning_setting]) {
		const effort = value?.toLowerCase().trim();
		if (effort && EFFORTS.has(effort)) return effort;
	}
	return undefined;
}

export function parseBoggs(dashboard: BoggsDashboard): SourceObservation[] {
	if (!Array.isArray(dashboard?.benchmarks) || !Array.isArray(dashboard.results)) throw new Error("boggs.tech dashboard format changed: expected benchmarks[] and results[].");
	const observedOn = dashboard.generated_at?.slice(0, 10);
	const boards = new Map(BOARDS.map((board) => [board.boggsId, board]));
	const observations: SourceObservation[] = [];
	for (const row of dashboard.results) {
		const board = boards.get(row.benchmark_id);
		if (!board || !row.model) continue;
		// The publisher's own label keeps the effort and setting ("Claude Opus 5.5 (high)"); `model` is boggs' normalized name.
		const label = (row.source_model || row.model).trim();
		if (NON_MODEL.test(label)) continue;
		const value = board.scale === "share" ? (typeof row.reported_score === "number" ? row.reported_score * 100 : Number.NaN) : row.raw_score;
		if (!Number.isFinite(value)) continue;
		observations.push({
			benchmarkId: board.id,
			label,
			effort: statedEffort(row),
			harness: (row.harness || row.agent_harness || row.agent)?.trim() || undefined,
			value,
			observedOn,
			url: row.source_url || undefined,
			note: `published by ${board.publisher}; collected by boggs.tech`,
		});
	}
	return observations;
}

export const boggs: BenchmarkSource = {
	id: "boggs",
	name: "boggs.tech benchmark dashboard",
	publisher: "boggs.tech",
	url: PAGE,
	attribution: "Jake Boggs' benchmark dashboard (boggs.tech); each score belongs to the board's own publisher",
	minRows: 750,
	// Each benchmark links to its publisher's board, not to the dashboard.
	benchmarks: BOARDS.map(({ boggsId: _boggsId, publisher: _publisher, scale: _scale, ...definition }) => definition),
	async fetch(ctx) {
		return parseBoggs(await ctx.fetchJson<BoggsDashboard>(DATA));
	},
};
