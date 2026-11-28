import { jsonAfter, nextFlight } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Scale Labs (SEAL) leaderboards. Each labs.scale.com/leaderboard/<slug> page is a Next.js App Router page whose flight
 * payload carries the table as `{"entries":[{model, score, confidenceInterval_upper, …}]}`; boards with tabs wrap each
 * tab as `{"key":"full","label":"Full","entries":[…]}`.
 */

const ORIGIN = "https://labs.scale.com/leaderboard";

type Entry = { model?: string; score?: number; confidenceInterval_upper?: number; contaminationMessage?: string; deprecated?: boolean };

type ScaleBoard = {
	slug: string;
	/** Tab key → benchmark id. Boards without tabs use the key "". Tabs not listed here are ignored. */
	variants: Record<string, string>;
};

const EFFORT = /\)\s*(none|minimal|low|medium|high|x-?high|max)\s*$/i;
const HARNESS = /agent|code|codex|cli|openhands|terminus|mcp-atlas|antigravity|claw|cursor|factory|harness|build|cowork/i;
const EFFORT_ONLY = /^(?:thinking\s+)?(?:none|minimal|low|medium|high|x-?high|max)(?:\s+thinking)?$/i;

/** "Claude Opus 5 (Claude Code) xHigh*" → label "Claude Opus 5", harness "Claude Code", effort "xhigh". */
export function splitScaleLabel(raw: string): { label: string; harness?: string; effort?: string } {
	let label = raw.replace(/[*†‡]+/g, " ").replace(/\s+/g, " ").trim();
	let effort: string | undefined;
	const tail = label.match(EFFORT);
	if (tail) {
		effort = tail[1].toLowerCase().replace("-", "");
		label = label.slice(0, tail.index! + 1).trim();
	}
	let harness: string | undefined;
	label = label.replace(/\s*\(([^()]+)\)/g, (group, inner: string) => {
		if (!harness && HARNESS.test(inner) && !EFFORT_ONLY.test(inner.trim())) { harness = inner.trim(); return ""; }
		return group;
	}).trim();
	return { label, harness, effort };
}

/** Every entries table on the page, keyed by its tab key ("" when the board has no tabs). */
export function scaleTables(flight: string): Map<string, Entry[]> {
	const tables = new Map<string, Entry[]>();
	for (const match of flight.matchAll(/"entries":\[/g)) {
		const before = flight.slice(Math.max(0, match.index! - 200), match.index!);
		const key = before.match(/"key":"([^"]*)","label":"[^"]*",$/)?.[1] ?? "";
		const entries = jsonAfter<Entry[]>(flight.slice(match.index!), "[");
		if (Array.isArray(entries) && !tables.has(key)) tables.set(key, entries);
	}
	return tables;
}

export function parseScaleBoard(board: ScaleBoard, html: string, definitions: Map<string, BenchmarkDefinition>): SourceObservation[] {
	const tables = scaleTables(nextFlight(html));
	return Object.entries(board.variants).flatMap(([key, benchmarkId]) => {
		const entries = tables.get(key);
		if (!entries) throw new Error(`Scale ${board.slug}: tab "${key}" not found (have ${[...tables.keys()].map((k) => k || "(none)").join(", ")}).`);
		const definition = definitions.get(benchmarkId)!;
		return entries.flatMap((entry): SourceObservation[] => {
			// Scale shows deprecated entries for reference without a rank; they stay out of the ranked import.
			if (entry.deprecated || typeof entry.model !== "string" || typeof entry.score !== "number" || !Number.isFinite(entry.score)) return [];
			const { label, harness, effort } = splitScaleLabel(entry.model);
			const ci = typeof entry.confidenceInterval_upper === "number" && entry.confidenceInterval_upper > 0 ? entry.confidenceInterval_upper : undefined;
			const note = entry.contaminationMessage?.trim();
			return [{
				benchmarkId,
				label,
				effort,
				harness,
				value: entry.score,
				ciLow: ci !== undefined ? entry.score - ci : undefined,
				ciHigh: ci !== undefined ? entry.score + ci : undefined,
				note: note || undefined,
				url: definition.url,
			}];
		});
	});
}

const BOARDS: ScaleBoard[] = [
	{ slug: "swe_bench_pro_public_v2", variants: { full: "swe-bench-pro-v2", hard: "swe-bench-pro-v2-hard" } },
	{ slug: "swe-atlas", variants: { overall: "swe-atlas", qna: "swe-atlas-codebase-qna", testwriting: "swe-atlas-test-writing", refactoring: "swe-atlas-refactoring" } },
	{ slug: "mcp_atlas", variants: { "": "scale-mcp-atlas" } },
	{ slug: "rli", variants: { "": "remote-labor-index" } },
	{ slug: "drugdiscoverybench", variants: { "": "drugdiscoverybench" } },
	{ slug: "hss", variants: { "": "humanitys-sixth-sense" } },
	{ slug: "hle-diamond", variants: { "": "hle-diamond" } },
	{ slug: "humanitys_last_exam_text_only", variants: { "": "humanitys-last-exam-text-only" } },
	{ slug: "enigma_eval", variants: { "": "enigmaeval" } },
	{ slug: "multichallenge", variants: { large: "scale-multichallenge", small: "scale-multichallenge" } },
	{ slug: "prbench", variants: { finance: "prbench-finance", legal: "prbench-legal" } },
	{ slug: "audiomc", variants: { text: "audiomultichallenge-text", audio: "audiomultichallenge-audio" } },
	{ slug: "fortress", variants: { "": "fortress" } },
	{ slug: "distressbench", variants: { "": "distressbench" } },
];

const page = (slug: string) => `${ORIGIN}/${slug}`;

const BENCHMARKS: BenchmarkDefinition[] = [
	{ id: "swe-bench-pro-v2", name: "SWE-Bench Pro V2", url: page("swe_bench_pro_public_v2"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "An agent resolves software-engineering tasks drawn from real repositories, with human-augmented issue descriptions and verified tests. Resolve rate: share of tasks whose patch fixes the issue and passes the tests, with a 95% interval." },
	{ id: "swe-bench-pro-v2-hard", name: "SWE-Bench Pro V2 (Hard)", url: page("swe_bench_pro_public_v2"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "The hard subset of SWE-Bench Pro V2. Resolve rate: share of tasks whose patch fixes the issue and passes the tests." },
	{ id: "swe-atlas", name: "SWE Atlas", url: page("swe-atlas"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Coding agents work on codebase comprehension (QnA), test writing and refactoring in real repositories. Overall score across the three tracks, with a 95% interval." },
	{ id: "swe-atlas-codebase-qna", name: "SWE Atlas Codebase QnA", url: page("swe-atlas"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Coding agents answer deep questions about real-world software repositories. SWE Atlas QnA score, with a 95% interval." },
	{ id: "swe-atlas-test-writing", name: "SWE Atlas Test Writing", url: page("swe-atlas"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Coding agents write tests for real-world software repositories. SWE Atlas test-writing score, with a 95% interval." },
	{ id: "swe-atlas-refactoring", name: "SWE Atlas Refactoring", url: page("swe-atlas"), category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "Coding agents refactor code in real-world software repositories. SWE Atlas refactoring score, with a 95% interval." },
	{ id: "scale-mcp-atlas", name: "MCP Atlas", url: page("mcp_atlas"), category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "The model uses real tools over the Model Context Protocol (36 MCP servers, 220 tools, 3 to 6 tool calls per task) to answer 1,000 tasks. Pass rate: share of tasks whose final answer is judged sufficiently correct against ground-truth claims." },
	{ id: "remote-labor-index", name: "Remote Labor Index (RLI)", url: page("rli"), category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "AI agents do real, paid remote-work projects with multi-file deliverables (documents, audio, video, 3D models, CAD). Automation rate: share of projects where the deliverable is judged at least as good as the human standard." },
	{ id: "drugdiscoverybench", name: "DrugDiscoveryBench", url: page("drugdiscoverybench"), category: "science", type: "percentage", higherIsBetter: true, unit: "%", description: "Coding agents work through 82 expert tasks from early-stage drug discovery, each graded by an LLM judge against an expert-written rubric. Pass rate: share of tasks with a full outcome score of 100." },
	{ id: "humanitys-sixth-sense", name: "Humanity's Sixth Sense (HSS)", url: page("hss"), category: "multimodal", type: "percentage", higherIsBetter: true, unit: "%", description: "Intuitive visual reasoning over 522 image and video tasks across four domains, built with Elorian. Pass@1 averaged over three attempts per task, with 95% bootstrap intervals." },
	{ id: "hle-diamond", name: "HLE-Diamond", url: page("hle-diamond"), category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "A refined subset of Humanity's Last Exam, built with the Center for AI Safety: expert-level questions across science, maths and the humanities. Accuracy (%) on Scale's leaderboard." },
	{ id: "humanitys-last-exam-text-only", name: "Humanity's Last Exam (text only)", url: page("humanitys_last_exam_text_only"), category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Humanity's Last Exam restricted to its text-only expert questions, with multimodal questions excluded. Accuracy (%) on Scale's leaderboard, with a 95% interval." },
	{ id: "enigmaeval", name: "EnigmaEval", url: page("enigma_eval"), category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Puzzle-hunt puzzles that need creative problem-solving and cross-domain knowledge; the model gives a step-by-step solution and a final answer. Accuracy (pass@1) with a 95% interval." },
	{ id: "scale-multichallenge", name: "MultiChallenge", url: page("multichallenge"), category: "instruction-following", type: "percentage", higherIsBetter: true, unit: "%", description: "Realistic multi-turn conversations that test instruction retention, inference memory and self-coherence. Score with a 95% interval; Scale lists large and small models in separate tabs." },
	{ id: "prbench-finance", name: "PRBench Finance", url: page("prbench"), category: "finance", type: "percentage", higherIsBetter: true, unit: "%", description: "Professional Reasoning Benchmark, finance questions: an LLM judge scores each response against expert rubric criteria, giving a weighted score clipped to 0 to 1 (shown as %)." },
	{ id: "prbench-legal", name: "PRBench Legal", url: page("prbench"), category: "legal", type: "percentage", higherIsBetter: true, unit: "%", description: "Professional Reasoning Benchmark, legal questions: an LLM judge scores each response against expert rubric criteria, giving a weighted score clipped to 0 to 1 (shown as %)." },
	{ id: "audiomultichallenge-text", name: "AudioMultiChallenge (text output)", url: page("audiomc"), category: "speech", type: "percentage", higherIsBetter: true, unit: "%", description: "Spoken multi-turn dialogue testing interaction, voice editing and instruction retention, with the model answering in text. Average pass rate: a task passes only if every rubric is satisfied." },
	{ id: "audiomultichallenge-audio", name: "AudioMultiChallenge (audio output)", url: page("audiomc"), category: "speech", type: "percentage", higherIsBetter: true, unit: "%", description: "Spoken multi-turn dialogue testing interaction, voice editing and instruction retention, with the model answering in audio. Average pass rate: a task passes only if every rubric is satisfied." },
	{ id: "fortress", name: "FORTRESS (average risk score)", url: page("fortress"), category: "safety", type: "percentage", higherIsBetter: false, unit: "%", description: "Adversarial prompts on CBRNE, political violence and terrorism, and criminal and financial illicit activity. Average Risk Score: share of expert rubric questions judged harmful by a panel of three LLM judges, averaged over prompts. Lower is better." },
	{ id: "distressbench", name: "DistressBench", url: page("distressbench"), category: "safety", type: "percentage", higherIsBetter: true, unit: "%", description: "718 crisis-support conversations written by licensed clinicians and crisis counsellors. Weighted rubric score: share of clinician-assigned rubric weight the reply satisfies, averaged over tasks and three runs." },
];

const DEFINITIONS = new Map(BENCHMARKS.map((benchmark) => [benchmark.id, benchmark]));

export const scale: BenchmarkSource = {
	id: "scale",
	name: "Scale Labs leaderboards",
	publisher: "Scale AI",
	url: ORIGIN,
	attribution: "Scale AI SEAL leaderboards (labs.scale.com)",
	minRows: 425,
	benchmarks: BENCHMARKS,
	async fetch(ctx) {
		const pages = await Promise.all(BOARDS.map((board) => ctx.fetchText(page(board.slug))));
		return BOARDS.flatMap((board, index) => parseScaleBoard(board, pages[index], DEFINITIONS));
	},
};
