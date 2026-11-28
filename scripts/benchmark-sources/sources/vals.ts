import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";

/**
 * Vals AI (vals.ai). Every benchmark page is an Astro page whose leaderboard island loads one "benchmark view": metadata
 * plus a score table per task, keyed by Vals' model id. Most pages link it as a JSON file (`benchmarkViewUrl`); a few
 * bespoke pages (the RSI Index) bundle it as a JS module instead. One source per board, so a board that changes version
 * or format stops on its own and the others keep running.
 */

const ORIGIN = "https://www.vals.ai";
const ATTRIBUTION = "Vals AI (vals.ai)";

type ValsRecord = {
	accuracy?: number | null;
	stderr?: number | null;
	latency?: number | null;
	cost_per_test?: number | null;
	avg_output_tokens?: number | null;
	reasoning_effort?: string | null;
	compute_effort?: string | null;
	harness?: string | null;
};
export type ValsView = {
	metadata: { slug: string; version?: string; updated?: string; archived?: boolean };
	tasks: Record<string, Record<string, ValsRecord>>;
};

type ValsBenchmark = Omit<BenchmarkDefinition, "url" | "type" | "higherIsBetter" | "unit"> & {
	/** Key in `tasks`; "overall" is the headline score. */
	task: string;
	type?: BenchmarkDefinition["type"];
	higherIsBetter?: boolean;
	unit?: string;
};
export type ValsBoard = {
	/** Page slug: https://www.vals.ai/benchmarks/<slug>. */
	slug: string;
	/** `metadata.slug` when the payload uses a different one. */
	payloadSlug?: string;
	/** The version the ids below describe. A new version stops the board until someone decides on its id. */
	version: string;
	name: string;
	minRows: number;
	/** Island that bundles the view as a JS module rather than linking JSON. */
	module?: string;
	/** Rows that aren't a single model, e.g. routers on the Router Index. */
	skip?: RegExp;
	benchmarks: ValsBenchmark[];
};

const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

function effortOf(record: ValsRecord): string | undefined {
	for (const value of [record.reasoning_effort, record.compute_effort]) {
		const effort = typeof value === "string" ? value.trim().toLowerCase() : "";
		if (EFFORTS.has(effort)) return effort;
	}
	return undefined;
}

function slug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Vals ids put the search tool or harness on the end ("claude-opus-5-5-parallel-fast"); the harness has its own column. */
export function valsLabel(modelKey: string, harness: string | undefined): string {
	if (!harness) return modelKey;
	const suffix = `-${slug(harness)}`;
	return modelKey.toLowerCase().endsWith(suffix) ? modelKey.slice(0, -suffix.length) : modelKey;
}

export function parseValsView(board: ValsBoard, view: ValsView, definitions: BenchmarkDefinition[]): SourceObservation[] {
	if (!view?.metadata || !view.tasks) throw new Error(`Vals ${board.slug}: benchmark view has no metadata or tasks.`);
	const expected = board.payloadSlug ?? board.slug;
	if (view.metadata.slug !== expected) throw new Error(`Vals ${board.slug}: payload belongs to ${view.metadata.slug}.`);
	if (view.metadata.version !== board.version) {
		throw new Error(`Vals ${board.slug} is now v${view.metadata.version} (configured v${board.version}); decide whether it keeps its benchmark id.`);
	}
	const observedOn = /^\d{4}-\d{2}-\d{2}/.test(view.metadata.updated ?? "") ? view.metadata.updated!.slice(0, 10) : undefined;
	const byId = new Map(definitions.map((definition) => [definition.id, definition]));
	return board.benchmarks.flatMap((benchmark) => {
		const table = view.tasks[benchmark.task];
		if (!table || typeof table !== "object") throw new Error(`Vals ${board.slug}: task "${benchmark.task}" missing.`);
		const definition = byId.get(benchmark.id)!;
		return Object.entries(table).flatMap(([modelKey, record]): SourceObservation[] => {
			const value = finite(record?.accuracy);
			if (value === undefined || board.skip?.test(modelKey)) return [];
			const harness = typeof record.harness === "string" && record.harness.trim() ? record.harness.trim() : undefined;
			const stderr = finite(record.stderr);
			return [{
				benchmarkId: benchmark.id,
				label: valsLabel(modelKey, harness),
				value,
				effort: effortOf(record),
				harness,
				ciLow: stderr !== undefined && stderr > 0 ? value - 1.96 * stderr : undefined,
				ciHigh: stderr !== undefined && stderr > 0 ? value + 1.96 * stderr : undefined,
				costUsd: finite(record.cost_per_test),
				durationSeconds: finite(record.latency),
				outputTokens: finite(record.avg_output_tokens),
				observedOn,
				url: definition.url,
			}];
		});
	});
}

function decodeAttribute(value: string): string {
	return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** The `benchmarkViewUrl` an Astro island on the page passes to its loader. */
export function valsViewUrl(html: string): string | null {
	const match = decodeAttribute(html).match(/"benchmarkViewUrl":\[0,"([^"]+\.json)"\]/);
	return match ? new URL(match[1], ORIGIN).toString() : null;
}

/** A view bundled as a JS module: metadata as an object literal, tasks as `JSON.parse(\`…\`)`. */
export function parseValsViewModule(source: string): ValsView {
	const field = (name: string) => source.match(new RegExp(`\\b${name}:\`([^\`]*)\``))?.[1];
	const tasks = source.match(/JSON\.parse\(`((?:[^`\\]|\\.)*)`\)/)?.[1];
	if (!tasks) throw new Error("Vals view module has no tasks payload.");
	// Undo template-literal escaping before handing the text to JSON.parse.
	const json = tasks.replace(/\\([`$\\])/g, "$1");
	return { metadata: { slug: field("slug") ?? "", version: field("version"), updated: field("updated") }, tasks: JSON.parse(json) };
}

async function loadView(board: ValsBoard, ctx: SourceContext): Promise<ValsView> {
	const page = `${ORIGIN}/benchmarks/${board.slug}`;
	const html = await ctx.fetchText(page);
	if (!board.module) {
		const url = valsViewUrl(html);
		if (!url) throw new Error(`Vals ${board.slug}: page has no benchmarkViewUrl.`);
		return ctx.fetchJson<ValsView>(url);
	}
	const component = html.match(new RegExp(`component-url="(/_astro/${board.module}\\.[^"]+)"`))?.[1];
	if (!component) throw new Error(`Vals ${board.slug}: ${board.module} island not found.`);
	const componentJs = await ctx.fetchText(new URL(decodeAttribute(component), ORIGIN).toString());
	const viewModule = componentJs.match(new RegExp(`\\./(benchmark_view_${board.payloadSlug ?? board.slug}\\.[\\w-]+\\.js[^"']*)`))?.[1];
	if (!viewModule) throw new Error(`Vals ${board.slug}: view module import not found.`);
	return parseValsViewModule(await ctx.fetchText(`${ORIGIN}/_astro/${viewModule}`));
}

export function valsSource(board: ValsBoard): BenchmarkSource {
	const url = `${ORIGIN}/benchmarks/${board.slug}`;
	const benchmarks: BenchmarkDefinition[] = board.benchmarks.map(({ task: _task, ...benchmark }) => ({
		type: "percentage",
		higherIsBetter: true,
		unit: benchmark.type === "numerical" ? undefined : "%",
		...benchmark,
		url,
	}));
	return {
		id: `vals-${slug(board.slug)}`.replace(/^vals-vals-/, "vals-"),
		name: `Vals AI ${board.name}`,
		publisher: "Vals AI",
		url,
		attribution: ATTRIBUTION,
		benchmarks,
		minRows: board.minRows,
		async fetch(ctx) {
			return parseValsView(board, await loadView(board, ctx), benchmarks);
		},
	};
}

const ACCURACY = "Vals AI reports accuracy as a percentage.";
const RERUN = "Vals AI's own run of the public benchmark, scored as accuracy (%) on its harness.";

/** Every Vals board with a model leaderboard, current and archived. Ids follow the batch rules: Vals' re-runs of public benchmarks end in `-vals`. */
export const VALS_BOARDS: ValsBoard[] = [
	// Indexes
	{ slug: "vals_index", version: "2.2", name: "Vals Index", minRows: 25, benchmarks: [
		{ task: "overall", id: "vals-index", name: "Vals Index", category: "agents", description: "Agentic work across finance, coding, legal and tax tasks (Finance Agent, Excel modelling, Terminal-Bench, Vibe Code Bench, Code Migration, legal research, Harvey's legal agent benchmark and Tax Agent), weighted by each sector's share of U.S. GDP. Weighted score (%)." },
	] },
	{ slug: "vals_multimodal_index", version: "1.2", name: "Vals Multimodal Index", minRows: 20, benchmarks: [
		{ task: "overall", id: "vals-multimodal-index", name: "Vals Multimodal Index v1.2", category: "multimodal", description: "Weighted performance across finance, coding and education tasks (Finance Agent, CorpFin, SWE-bench, Terminal-Bench 2.1, Vibe Code Bench, SAGE and MortgageTax). Weighted score (%)." },
	] },
	{ slug: "rsi_index", version: "1.1", name: "Vals RSI Index", minRows: 70, module: "RsiBenchmarkView", benchmarks: [
		{ task: "overall", id: "vals-rsi-index", name: "Vals RSI Index v1.1", category: "agents", description: "The model does autonomous LLM research and development, the work that builds the next model, across pre-training, harness engineering and post-training tasks. Scored against frozen published, human and frontier-model references (%)." },
		{ task: "compression", id: "vals-rsi-compression", name: "Vals RSI: Pre-training compression", category: "agents", description: "RSI Index task: pre-training compression research, scored against frozen published, human and frontier-model references (%)." },
		{ task: "lm_training", id: "vals-rsi-lm-training", name: "Vals RSI: Pre-training LM training", category: "agents", description: "RSI Index task: language-model pre-training research, scored against frozen published, human and frontier-model references (%)." },
		{ task: "harness_engineering", id: "vals-rsi-harness-engineering", name: "Vals RSI: Harness engineering (judge)", category: "agents", description: "RSI Index task: engineering an evaluation judge harness, scored against frozen published, human and frontier-model references (%)." },
		{ task: "post_training", id: "vals-rsi-post-training", name: "Vals RSI: Post-training (Finance Agent)", category: "agents", description: "RSI Index task: post-training a model for the Finance Agent benchmark, scored against frozen published, human and frontier-model references (%)." },
	] },
	{ slug: "time_horizon_index", version: "1", name: "Time Horizon Index: KSP", minRows: 8, benchmarks: [
		{ task: "overall", id: "vals-time-horizon-ksp", name: "Time Horizon Index: KSP", category: "agents", description: "An agent gets five days to build and run a space program in Kerbal Space Program. Score is how far it gets through a fixed ladder of 30 missions: each completed mission is worth 3.33%, with partial credit for milestones within a mission." },
	] },
	{ slug: "web_search", payloadSlug: "web_search_backends", version: "1", name: "Web Search Index", minRows: 8, benchmarks: [
		{ task: "overall", id: "vals-web-search-index", name: "Vals Web Search Index", category: "agents", description: "Agents answer legal-research and finance-analysis tasks using either the provider's native web search or an independent search tool (recorded as the harness). Accuracy (%)." },
	] },
	{ slug: "finance_index", version: "1", name: "Finance Index", minRows: 28, benchmarks: [
		{ task: "overall", id: "vals-finance-index", name: "Vals Finance Index", category: "finance", description: "Agentic finance work, from analyst research (Finance Agent) and financial modelling (EMB) to corporate tax research (Tax Agent Bench), weighted by each sub-sector's share of U.S. GDP. Weighted score (%)." },
	] },
	{ slug: "legal_index", version: "1", name: "Legal Index", minRows: 26, benchmarks: [
		{ task: "overall", id: "vals-legal-index", name: "Vals Legal Index", category: "legal", description: "Legal research and legal drafting across practice areas, weighted by each area's share of U.S. law-office revenue. Weighted score (%)." },
	] },
	{ slug: "science_index", version: "1.0", name: "Science Index", minRows: 17, benchmarks: [
		{ task: "overall", id: "vals-science-index", name: "Vals Science Index", category: "science", description: "Agentic science work: biology data investigation (BioMysteryBench), mechanism discovery (MysteryMechanism) and research workflows (Terminal-Bench-Science), weighted equally. Score (%)." },
	] },
	{ slug: "vals_router_index", version: "1.0", name: "Router Index", minRows: 14, skip: /router|switchyard|openrouter\/auto|fugu/i, benchmarks: [
		{ task: "overall", id: "vals-router-index", name: "Vals Router Index", category: "agents", description: "Long agentic work from the Vals Index, used to compare model routers with single models. Only single-model rows are kept. Weighted score (%)." },
	] },
	// Coding and agents
	{ slug: "programbench", version: "1", name: "ProgramBench", minRows: 120, benchmarks: [
		{ task: "overall", id: "programbench-vals", name: "ProgramBench (Vals): fully resolved", category: "coding", description: "The model rebuilds a program from scratch from its behavioural specification; the implementation must compile and pass hidden tests. Share of tasks Fully Resolved, i.e. passing every hidden test, on Vals AI's run." },
		{ task: "almost", id: "programbench-vals-almost-resolved", name: "ProgramBench (Vals): almost resolved", category: "coding", description: "ProgramBench on Vals AI's run: share of tasks where the from-scratch implementation passes at least 95% of the hidden tests." },
		{ task: "partial", id: "programbench-vals-raw-pass-rate", name: "ProgramBench (Vals): raw pass rate", category: "coding", description: "ProgramBench on Vals AI's run: average percentage of hidden behavioural tests passed per task." },
	] },
	{ slug: "code-migration-v1-1", version: "1.1", name: "Code Migration v1.1", minRows: 18, benchmarks: [
		{ task: "overall", id: "vals-code-migration-v1-1", name: "Vals Code Migration v1.1", category: "coding", description: `The agent reimplements a real-world program in another language (CLI and COBOL tasks, plus code quality). ${ACCURACY}` },
	] },
	{ slug: "code-migration", version: "1", name: "Code Migration v1", minRows: 47, benchmarks: [
		{ task: "overall", id: "vals-code-migration-v1", name: "Vals Code Migration v1", category: "coding", description: `The agent reimplements a real-world program in another language (CLI and COBOL tasks, plus code quality). ${ACCURACY}` },
	] },
	{ slug: "cua_bench", version: "1", name: "CUA-bench", minRows: 5, benchmarks: [
		{ task: "overall", id: "vals-cua-bench", name: "Vals CUA-bench", category: "agents", description: "A computer-use agent plays six commercial video games with only keyboard and mouse, from pixels; three games are held out. Each game has milestones worth 100 points, and the score is the mean across the six games." },
	] },
	{ slug: "cyber", version: "1.1", name: "CyberBench v1.1", minRows: 29, benchmarks: [
		{ task: "overall", id: "vals-cyberbench-v1-1", name: "Vals CyberBench v1.1", category: "security", description: `Autonomous agents craft proof-of-concept inputs that trigger OSS-Fuzz vulnerabilities and write source patches that fix them. ${ACCURACY}` },
	] },
	{ slug: "ioi", version: "2", name: "IOI", minRows: 28, benchmarks: [
		{ task: "overall", id: "ioi-vals", name: "IOI (Vals)", category: "coding", description: `Competitive programming problems from the International Olympiad in Informatics (2024 to 2026), solved by an agent. ${RERUN}` },
	] },
	{ slug: "poker_agent", version: "1", name: "Poker Agent", minRows: 10, benchmarks: [
		{ task: "overall", id: "vals-poker-agent", name: "Vals Poker Agent", category: "games", type: "numerical", unit: "TrueSkill", description: "Models play each other over 20,000 hands of 10-seat no-limit Texas Hold'em. Ranked by TrueSkill rating." },
	] },
	{ slug: "public-benefits-bench", version: "1.1", name: "Public Benefits Bench v1.1", minRows: 30, benchmarks: [
		{ task: "overall", id: "vals-public-benefits-bench-v1-1", name: "Vals Public Benefits Bench v1.1", category: "agents", description: `The model helps people navigate SNAP benefits. ${ACCURACY}` },
	] },
	{ slug: "public-benefits-bench-v1", version: "1", name: "Public Benefits Bench v1", minRows: 8, benchmarks: [
		{ task: "overall", id: "vals-public-benefits-bench-v1", name: "Vals Public Benefits Bench v1", category: "agents", description: `The model helps people navigate SNAP benefits, with and without web search and multi-turn conversation. ${ACCURACY}` },
	] },
	{ slug: "sage", version: "1.1", name: "SAGE", minRows: 18, benchmarks: [
		{ task: "overall", id: "vals-sage", name: "Vals SAGE v1.1", category: "education", description: `Student Assessment with Generative Evaluation: the model grades student work in partial differential equations, linear algebra and computer science. ${ACCURACY}` },
	] },
	{ slug: "skillsbench", version: "1", name: "SkillsBench", minRows: 21, benchmarks: [
		{ task: "overall", id: "skillsbench-vals", name: "SkillsBench (Vals)", category: "agents", description: `Agents complete tasks with and without access to skills, to measure how much skills help. ${RERUN}` },
	] },
	{ slug: "srebench", version: "1", name: "SRE Bench", minRows: 45, benchmarks: [
		{ task: "overall", id: "vals-sre-bench", name: "Vals SRE Bench: fully solved", category: "security", description: "Agents reverse engineer real-world, contamination-free binaries across 262 instances of six tasks each. Fully Solved credits an instance only when all six of its tasks are completed (%)." },
		{ task: "partial", id: "vals-sre-bench-capability", name: "Vals SRE Bench: capability score", category: "security", description: "SRE Bench capability score: share of the 1,572 individual reverse-engineering tasks the agent completes, over all 262 instances (%)." },
	] },
	{ slug: "terminal-bench-4", version: "4.0", name: "Terminal-Bench 4.0", minRows: 42, benchmarks: [
		{ task: "overall", id: "terminal-bench-4-vals", name: "Terminal-Bench 4.0 (Vals)", category: "coding", description: `Frontier-difficulty terminal tasks across software, science, ML, operations, hardware, security and media, run by an agent in a terminal. ${RERUN}` },
	] },
	{ slug: "vibe-code", version: "1.1", name: "Vibe Code Bench v1.1", minRows: 80, benchmarks: [
		{ task: "overall", id: "vibe-code-bench", name: "Vibe Code Bench v1.1", category: "coding", description: `The model builds a web application from scratch. ${ACCURACY}` },
	] },
	{ slug: "vcb-1-100-v1-1", version: "1.1", name: "Vibe Code Bench 1-100 v1.1", minRows: 6, benchmarks: [
		{ task: "overall", id: "vals-vibe-code-bench-1-100-v1-1", name: "Vibe Code Bench 1-100 v1.1", category: "coding", description: `The model extends a working web application across a long sequence of dependent requests. ${ACCURACY}` },
	] },
	{ slug: "vcb-1-100", version: "1", name: "Vibe Code Bench 1-100 v1", minRows: 15, benchmarks: [
		{ task: "overall", id: "vals-vibe-code-bench-1-100-v1", name: "Vibe Code Bench 1-100 v1", category: "coding", description: `The model extends a working web application across a long sequence of dependent requests. ${ACCURACY}` },
	] },
	{ slug: "voice-code-bench", version: "1", name: "VoiceCodeBench", minRows: 24, benchmarks: [
		{ task: "overall", id: "vals-voicecodebench", name: "Vals VoiceCodeBench", category: "speech", description: "Speech recognition on 300 human-recorded English workplace clips full of exact structured values. Task Success Rate: a clip passes only when every target entity is transcribed correctly (%)." },
		{ task: "wer", id: "vals-voicecodebench-wer", name: "Vals VoiceCodeBench WER", category: "speech", higherIsBetter: false, description: "VoiceCodeBench word error rate on the same 300 workplace clips; lower is better (%)." },
	] },
	{ slug: "swebench-multimodal", version: "1", name: "SWE-bench Multimodal", minRows: 14, benchmarks: [
		{ task: "overall", id: "swe-bench-multimodal-vals", name: "SWE-bench Multimodal (Vals)", category: "coding", description: `The agent resolves GitHub issues in JavaScript front-end repositories where the report is a screenshot as much as a description. ${RERUN}` },
	] },
	{ slug: "rctbench", version: "1", name: "RollerCoasterTycoonBench", minRows: 5, benchmarks: [
		{ task: "overall", id: "vals-rollercoaster-tycoon-bench", name: "Vals RollerCoasterTycoonBench", category: "games", description: "A decision model runs a RollerCoaster Tycoon 2 park for three in-game years. Score combines the share of the guest and park-rating goal met with company value against a $100,000 target (%)." },
	] },
	{ slug: "robo_bench", version: "1", name: "Robo-bench", minRows: 6, benchmarks: [
		{ task: "overall", id: "vals-robo-bench", name: "Vals Robo-bench", category: "agents", description: "The model controls a robot arm and a humanoid in a real-time physics simulation from motor commands and camera images; most tasks are held out. Milestones in each task are worth 100 points, and the score is the mean over all 24 tasks." },
	] },
	{ slug: "autoform_hard", version: "0.2", name: "Autoform-Hard", minRows: 5, benchmarks: [
		{ task: "overall", id: "vals-autoform-hard", name: "Vals Autoform-Hard", category: "math", description: `Agents formalise graduate- and research-level mathematics in Lean 4. ${ACCURACY}` },
	] },
	// Finance, legal, tax, medicine, science
	{ slug: "emb-v1-1", version: "1.1", name: "Excel Modeling v1.1", minRows: 28, benchmarks: [
		{ task: "overall", id: "vals-excel-modeling-v1-1", name: "Vals Excel Modeling Benchmark v1.1", category: "finance", description: "Agents build Excel financial models (LBO, DCF, M&A, operating models, comps) from templates and from scratch, graded by a rubric judge (%)." },
	] },
	{ slug: "emb", version: "1", name: "Excel Modeling v1", minRows: 46, benchmarks: [
		{ task: "overall", id: "vals-excel-modeling-v1", name: "Vals Excel Modeling Benchmark v1", category: "finance", description: `Agents build Excel financial models (LBO, DCF, M&A, operating models, comps) from templates and from scratch. ${ACCURACY}` },
	] },
	{ slug: "fabv2-1", version: "2.1", name: "Finance Agent v2.1", minRows: 28, benchmarks: [
		{ task: "overall", id: "vals-finance-agent-v2-1", name: "Vals Finance Agent v2.1", category: "finance", description: `Agents do core financial-analyst tasks (qualitative and quantitative analysis, market analysis, comparables, precedents) with the FAB v2 harness on the reviewed v2.1 dataset. ${ACCURACY}` },
	] },
	{ slug: "fabv2", version: "2", name: "Finance Agent v2", minRows: 48, benchmarks: [
		{ task: "overall", id: "vals-finance-agent-v2", name: "Vals Finance Agent v2", category: "finance", description: `Agents do core financial-analyst tasks (qualitative and quantitative analysis, market analysis, comparables, precedents) with the FAB v2 harness. ${ACCURACY}` },
	] },
	{ slug: "financial-coaching-bench", version: "1", name: "Financial Coaching Bench", minRows: 17, benchmarks: [
		{ task: "overall", id: "vals-financial-coaching-bench", name: "Vals Financial Coaching Bench", category: "finance", description: `The agent coaches a simulated client through a real financial health problem. ${ACCURACY}` },
	] },
	{ slug: "claimbench", version: "1", name: "ClaimBench", minRows: 21, benchmarks: [
		{ task: "overall", id: "vals-claimbench", name: "Vals ClaimBench", category: "finance", description: `The model decides whether a 10-K excerpt supports a claim, contradicts it, or says nothing about it. ${ACCURACY}` },
	] },
	{ slug: "tax_agent_bench", version: "1", name: "Tax Agent Bench", minRows: 55, benchmarks: [
		{ task: "overall", id: "vals-tax-agent-bench", name: "Vals Tax Agent Bench", category: "finance", description: `Agents answer research-grade US tax questions with the Tax Agent Bench harness. ${ACCURACY}` },
	] },
	{ slug: "hlab", version: "1.1", name: "Harvey's Legal Agent Benchmark (HLAB-Vals-1.1)", minRows: 26, benchmarks: [
		{ task: "overall", id: "harvey-lab-vals-v1-1", name: "Harvey's Legal Agent Benchmark (Vals, v1.1)", category: "legal", description: "Agents complete legal work across practice areas using documents, spreadsheets, presentations and file-system tools. Vals AI's run of Harvey's benchmark, version HLAB-Vals-1.1 (%)." },
	] },
	{ slug: "hlab-v1", version: "1", name: "Harvey's Legal Agent Benchmark v1", minRows: 48, benchmarks: [
		{ task: "overall", id: "harvey-lab-vals-v1", name: "Harvey's Legal Agent Benchmark (Vals, v1)", category: "legal", description: "Agents complete legal work across practice areas using documents, spreadsheets, presentations and file-system tools. Vals AI's run of Harvey's benchmark, v1 (archived) (%)." },
	] },
	{ slug: "legal_research", version: "1", name: "Legal Research Bench", minRows: 60, benchmarks: [
		{ task: "overall", id: "vals-legal-research-bench", name: "Vals Legal Research Bench", category: "legal", description: `Agents do legal research tasks across diverse areas of US law. ${ACCURACY}` },
	] },
	{ slug: "legal_bench", version: "1", name: "LegalBench", minRows: 90, benchmarks: [
		{ task: "overall", id: "legalbench-vals", name: "LegalBench (Vals)", category: "legal", description: `Open-source legal reasoning tasks covering issue spotting, rules, conclusions, interpretation and rhetoric. ${RERUN}` },
	] },
	{ slug: "a2j", version: "1", name: "Access to Justice Benchmark", minRows: 14, benchmarks: [
		{ task: "overall", id: "vals-access-to-justice", name: "Vals Access to Justice Benchmark", category: "legal", description: `The agent guides an unrepresented client through a real legal problem. ${ACCURACY}` },
	] },
	{ slug: "immigration", version: "1", name: "Immigration", minRows: 15, benchmarks: [
		{ task: "overall", id: "vals-immigration", name: "Vals Immigration", category: "legal", description: "Agents answer expert-written US immigration law questions, graded against per-question rubrics (%)." },
	] },
	{ slug: "medcode", version: "1", name: "MedCode", minRows: 65, benchmarks: [
		{ task: "overall", id: "vals-medcode", name: "Vals MedCode", category: "medical", description: `The model supports the medical billing process by assigning codes. ${ACCURACY}` },
	] },
	{ slug: "medscribe", version: "1", name: "MedScribe", minRows: 66, benchmarks: [
		{ task: "overall", id: "vals-medscribe", name: "Vals MedScribe", category: "medical", description: `The model supports doctors with administrative documentation work. ${ACCURACY}` },
	] },
	{ slug: "mysterymechanism", version: "1", name: "MysteryMechanism", minRows: 21, benchmarks: [
		{ task: "overall", id: "vals-mysterymechanism", name: "Vals MysteryMechanism", category: "science", description: `Agents rediscover sealed mathematical mechanisms through bounded experiments. ${ACCURACY}` },
	] },
	{ slug: "proof_bench", version: "1.1", name: "ProofBench v1.1", minRows: 33, benchmarks: [
		{ task: "overall", id: "vals-proofbench-v1-1", name: "Vals ProofBench v1.1", category: "math", description: `Automated theorem proving: the agent writes proofs that are checked. ${ACCURACY}` },
	] },
	{ slug: "biomysterybench", version: "1", name: "BioMysteryBench", minRows: 21, benchmarks: [
		{ task: "overall", id: "biomysterybench-vals", name: "BioMysteryBench (Vals)", category: "science", description: `Anthropic's benchmark of whether agents can solve real-world bioinformatics mysteries from raw data. ${RERUN}` },
	] },
	{ slug: "terminal-bench-science", version: "0.1", name: "Terminal-Bench-Science", minRows: 29, benchmarks: [
		{ task: "overall", id: "terminal-bench-science-vals", name: "Terminal-Bench-Science 0.1 (Vals)", category: "science", description: `Research workflow tasks contributed by practising scientists across life, physical, earth, mathematical and engineering sciences, run in a terminal. ${RERUN}` },
	] },
	// Archived boards: Vals no longer runs new models on these.
	{ slug: "aime", version: "1", name: "AIME", minRows: 57, benchmarks: [
		{ task: "overall", id: "aime-vals", name: "AIME (Vals)", category: "math", description: `AIME 2024 and 2025 competition maths problems. ${RERUN} Archived by Vals.` },
	] },
	{ slug: "gpqa", version: "1", name: "GPQA Diamond", minRows: 82, benchmarks: [
		{ task: "overall", id: "gpqa-diamond-vals", name: "GPQA Diamond (Vals)", category: "reasoning", description: `Graduate-level Google-proof science questions (Diamond set), few-shot and zero-shot chain of thought. ${RERUN}` },
	] },
	{ slug: "lcb", version: "1", name: "LiveCodeBench", minRows: 85, benchmarks: [
		{ task: "overall", id: "livecodebench-vals", name: "LiveCodeBench (Vals)", category: "coding", description: `Vals AI's implementation of LiveCodeBench: easy, medium and hard coding problems. ${RERUN}` },
	] },
	{ slug: "math500", version: "1", name: "MATH 500", minRows: 36, benchmarks: [
		{ task: "overall", id: "math-500-vals", name: "MATH 500 (Vals)", category: "math", description: `Academic maths problems from the MATH 500 set. ${RERUN}` },
	] },
	{ slug: "mgsm", version: "1", name: "MGSM", minRows: 45, benchmarks: [
		{ task: "overall", id: "mgsm-vals", name: "MGSM (Vals)", category: "math", description: `Grade-school maths word problems in 11 languages. ${RERUN}` },
	] },
	{ slug: "mmlu_pro", version: "1", name: "MMLU Pro", minRows: 82, benchmarks: [
		{ task: "overall", id: "mmlu-pro-vals", name: "MMLU-Pro (Vals)", category: "knowledge", description: `Multiple-choice questions across 14 subjects in STEM, humanities and social sciences. ${RERUN}` },
	] },
	{ slug: "mmmu", version: "1", name: "MMMU Pro", minRows: 55, benchmarks: [
		{ task: "overall", id: "mmmu-pro-vals", name: "MMMU Pro (Vals)", category: "multimodal", description: `Multimodal multi-discipline questions over images. ${RERUN}` },
	] },
	{ slug: "swebench", version: "1", name: "SWE-bench Verified", minRows: 52, benchmarks: [
		{ task: "overall", id: "swe-bench-verified-vals", name: "SWE-bench Verified (Vals)", category: "coding", description: `The agent resolves real GitHub issues from the SWE-bench Verified set. ${RERUN} Archived by Vals.` },
	] },
	{ slug: "terminal-bench-2-1", version: "2.1", name: "Terminal-Bench 2.1", minRows: 45, benchmarks: [
		{ task: "overall", id: "terminal-bench-2-1-vals", name: "Terminal-Bench 2.1 (Vals)", category: "coding", description: `Difficult terminal-based tasks run by an agent. ${RERUN} Archived by Vals.` },
	] },
	{ slug: "terminal-bench-2", version: "2.0", name: "Terminal-Bench 2.0", minRows: 40, benchmarks: [
		{ task: "overall", id: "terminal-bench-2-vals", name: "Terminal-Bench 2.0 (Vals)", category: "coding", description: `Difficult terminal-based tasks run by an agent. ${RERUN} Archived by Vals.` },
	] },
	{ slug: "case_law_v2", version: "2", name: "CaseLaw v2", minRows: 32, benchmarks: [
		{ task: "overall", id: "vals-caselaw-v2", name: "Vals CaseLaw v2", category: "legal", description: `Private question-answer benchmark over Canadian court cases. ${ACCURACY} Archived by Vals.` },
	] },
	{ slug: "corp_fin_v2", version: "2", name: "CorpFin v2", minRows: 80, benchmarks: [
		{ task: "overall", id: "vals-corpfin-v2", name: "Vals CorpFin v2", category: "finance", description: `Private benchmark of questions over long-context credit agreements. ${ACCURACY}` },
	] },
	{ slug: "medqa", version: "1", name: "MedQA", minRows: 57, benchmarks: [
		{ task: "overall", id: "medqa-vals", name: "MedQA (Vals)", category: "medical", description: `Medical exam questions, including variants that test for bias across patient demographics. ${RERUN}` },
	] },
	{ slug: "mortgage_tax", version: "1", name: "MortgageTax", minRows: 58, benchmarks: [
		{ task: "overall", id: "vals-mortgagetax", name: "Vals MortgageTax", category: "finance", description: `The model reads tax certificates given as images and extracts semantic and numerical fields. ${ACCURACY}` },
	] },
	{ slug: "tax_eval_v2", version: "2", name: "TaxEval v2", minRows: 87, benchmarks: [
		{ task: "overall", id: "vals-taxeval-v2", name: "Vals TaxEval v2", category: "finance", description: `Vals-written tax questions, graded for correctness and stepwise reasoning. ${ACCURACY}` },
	] },
];

export const VALS_SOURCES: BenchmarkSource[] = VALS_BOARDS.map(valsSource);
