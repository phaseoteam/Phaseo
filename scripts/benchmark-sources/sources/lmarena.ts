import { parquetReadObjects } from "hyparquet";
import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";

/**
 * Arena (formerly LMArena) leaderboards from the `lmarena-ai/leaderboard-dataset` Hugging Face dataset: the Parquet
 * file of each config's `latest` split. (The datasets-server JSON API serves the same rows 100 at a time and rate-limits
 * a full read.) Each config is a board and each `category` value a slice of it; the slice tables below define the
 * benchmark ids. Text, vision, document and search use the style-controlled configs, which are Arena's default view.
 */
const DATASET = "lmarena-ai/leaderboard-dataset";
const HUB = "https://huggingface.co";
const SITE = "https://arena.ai/leaderboard";

type Slice = { category: string; id: string; name: string; about: string };
type Board = {
	config: string;
	/** Arena page for the board. */
	page: string;
	/** "rating": Bradley-Terry Arena score. "index": Agent Arena index on the same anchored scale. "ips": Agent Arena IPS score τ̂, stored ×100. */
	metric: "rating" | "index" | "ips";
	slices: Slice[];
	benchmarkCategory: string;
	describe(slice: Slice): string;
};

const kebab = (value: string) => value.replace(/[_\s]+/g, "-").toLowerCase();
/** Categories whose id is `${prefix}-${category}` and whose name is `${board}: ${label}`. */
const sliced = (prefix: string, board: string, labels: Record<string, [string, string]>): Slice[] =>
	Object.entries(labels).map(([category, [label, about]]) => ({ category, id: `${prefix}-${kebab(category)}`, name: `${board}: ${label}`, about }));

const RATING = "Arena score (Bradley-Terry, from anonymous head-to-head votes) with its confidence interval.";
const voteBoard = (what: string) => (slice: Slice) => `People compare two anonymous models' answers ${what} and vote for the better one${slice.about ? `; this slice covers ${slice.about}` : ""}. ${RATING}`;

const LANGUAGES = ["chinese", "english", "french", "german", "japanese", "korean", "polish", "russian", "spanish"] as const;
const TEXT_CATEGORIES: Record<string, [string, string]> = {
	coding: ["Coding", "prompts that involve code"],
	creative_writing: ["Creative writing", "creative writing prompts"],
	hard_prompts: ["Hard prompts", "prompts Arena classifies as hard"],
	hard_prompts_english: ["Hard prompts (English)", "hard prompts in English"],
	instruction_following: ["Instruction following", "prompts with explicit instructions to follow"],
	longer_query: ["Longer query", "longer prompts"],
	math: ["Math", "math prompts"],
	multi_turn: ["Multi-turn", "multi-turn conversations"],
	expert: ["Expert", "expert-level prompts"],
	exclude_ties: ["Excluding ties", "votes that aren't ties"],
	non_english: ["Non-English", "prompts not in English"],
	...Object.fromEntries(LANGUAGES.map((language) => [language, [language[0].toUpperCase() + language.slice(1), `prompts in ${language[0].toUpperCase() + language.slice(1)}`]])),
	industry_business_and_management_and_financial_operations: ["Business, management and financial operations", "prompts from business, management and financial operations"],
	industry_entertainment_and_sports_and_media: ["Entertainment, sports and media", "prompts from entertainment, sports and media"],
	industry_legal_and_government: ["Legal and government", "prompts from legal and government work"],
	industry_life_and_physical_and_social_science: ["Life, physical and social science", "prompts from the life, physical and social sciences"],
	industry_mathematical: ["Mathematical", "prompts from mathematical work"],
	industry_medicine_and_healthcare: ["Medicine and healthcare", "prompts from medicine and healthcare"],
	industry_software_and_it_services: ["Software and IT services", "prompts from software and IT services"],
	industry_writing_and_literature_and_language: ["Writing, literature and language", "prompts from writing, literature and language work"],
};
const VISION_CATEGORIES: Record<string, [string, string]> = {
	captioning: ["Captioning", "image captioning"],
	chinese: ["Chinese", "prompts in Chinese"],
	creative_writing: ["Creative writing", "creative writing prompts"],
	creative_writing_vision: ["Creative writing (vision)", "creative writing about images"],
	diagram: ["Diagram", "diagrams"],
	english: ["English", "prompts in English"],
	entity_recognition: ["Entity recognition", "recognising entities in images"],
	homework: ["Homework", "homework questions"],
	humor: ["Humor", "humorous prompts"],
	ocr: ["OCR", "reading text in images"],
};
/** Arena's factuality toggle on the Text and Search boards (arena.ai/blog/factuality-in-arena). */
const FACTUALITY = "Arena splits each answer into atomic claims that can be checked on the web, has search agents verify them, and folds that factuality signal into the score at a 25% weight next to the votes.";
const factualityBoard = (what: string) => (slice: Slice) => `People compare two anonymous models' answers ${what} and vote for the better one${slice.about ? `; this slice covers ${slice.about}` : ""}. ${FACTUALITY} Factuality-weighted Arena score with its confidence interval.`;
const AGENT_CATEGORIES ={ code: ["Coding", "coding tasks"], chat: ["Chat", "conversational tasks"], work: ["Work", "knowledge-work tasks"] } satisfies Record<string, [string, string]>;
const AGENT_PAGE = "https://arena.ai/resources/agent-arena-signals";
const overall = (id: string, name: string): Slice => ({ category: "overall", id, name, about: "" });
const agentIndex = (prefix: string, name: string, overallName: string): Slice[] => [overall(prefix, overallName), ...sliced(prefix, name, AGENT_CATEGORIES)];
const agentText = (what: string, scale: string) => (slice: Slice) => `People use agents for real work on Arena; ${what}${slice.about ? ` This slice covers ${slice.about}.` : ""} ${scale}`;
const INDEX_SCALE = "Index score anchored to a fixed set of models, with its confidence interval.";
const IPS_SCALE = "Arena's IPS score (τ̂ × 100) for the signal, with a 95% interval; higher is better.";

export const ARENA_BOARDS: Board[] = [
	{ config: "text_style_control", page: `${SITE}/text`, metric: "rating", benchmarkCategory: "general", slices: [overall("lmarena-text", "LMArena Text"), ...sliced("lmarena-text", "LMArena Text", TEXT_CATEGORIES)], describe: voteBoard("to the same text prompt") },
	{ config: "vision_style_control", page: `${SITE}/vision`, metric: "rating", benchmarkCategory: "multimodal", slices: [overall("lmarena-vision", "LMArena Vision"), ...sliced("lmarena-vision", "LMArena Vision", VISION_CATEGORIES)], describe: voteBoard("to the same prompt with an image") },
	{
		config: "webdev",
		page: `${SITE}/webdev`,
		metric: "rating",
		benchmarkCategory: "code",
		// The "webdev" category repeats "overall".
		slices: [overall("lmarena-webdev", "LMArena WebDev"), { category: "webdev-html", id: "lmarena-webdev-html", name: "LMArena WebDev: HTML", about: "plain HTML apps" }, { category: "webdev-react", id: "lmarena-webdev-react", name: "LMArena WebDev: React", about: "React apps" }, { category: "image_to_webdev", id: "lmarena-image-to-webdev", name: "LMArena Image-to-WebDev", about: "building a web app from an image" }],
		describe: voteBoard("— two web apps built from the same prompt —"),
	},
	{ config: "document_style_control", page: `${SITE}/document`, metric: "rating", benchmarkCategory: "long_context", slices: [overall("lmarena-document", "LMArena Document")], describe: voteBoard("about an uploaded document") },
	{ config: "search_style_control", page: `${SITE}/search`, metric: "rating", benchmarkCategory: "grounding", slices: [overall("lmarena-search", "LMArena Search")], describe: voteBoard("that use web search") },
	{ config: "text_factuality", page: `${SITE}/text`, metric: "rating", benchmarkCategory: "hallucinations", slices: [overall("lmarena-text-factuality", "LMArena Text (factuality)"), ...sliced("lmarena-text-factuality", "LMArena Text (factuality)", TEXT_CATEGORIES)], describe: factualityBoard("to the same text prompt") },
	{ config: "search_factuality", page: `${SITE}/search`, metric: "rating", benchmarkCategory: "hallucinations", slices: [overall("lmarena-search-factuality", "LMArena Search (factuality)")], describe: factualityBoard("that use web search") },
	{ config: "agent", page: `${SITE}/agent`, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-net-improvement", "AgentArena (Net Improvement)")], describe: agentText("this is Agent Arena's aggregate across task completion, praise vs complaint, steerability and bash reliability.", IPS_SCALE) },
	{ config: "agent_capability", page: `${SITE}/agent`, metric: "index", benchmarkCategory: "agents", slices: agentIndex("agentarena-index", "Agent Arena Index", "Agent Arena Index"), describe: agentText("the Agent Arena Index combines the Task Completion, Praise vs Complaint, Steerability and Bash Reliability signals.", INDEX_SCALE) },
	{ config: "agent_task_outcome", page: `${SITE}/agent`, metric: "index", benchmarkCategory: "agents", slices: agentIndex("agentarena-task-outcome-index", "Agent Arena Task Outcome Index", "Agent Arena Task Outcome Index"), describe: agentText("the Task Outcome Index combines task completion with praise vs complaint from users.", INDEX_SCALE) },
	{ config: "agent_tool_efficiency", page: `${SITE}/agent`, metric: "index", benchmarkCategory: "agents", slices: agentIndex("agentarena-tool-use-index", "Agent Arena Tool Use Index", "Agent Arena Tool Use Index"), describe: agentText("the Tool Use Index measures how reliably agents use tools, currently from bash reliability.", INDEX_SCALE) },
	{ config: "agent_task_outcome_explicit", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-task-completion", "Agent Arena: Task completion")], describe: agentText("after each agent turn the user is asked \"Did this complete your task?\", and this signal is built from the yes and no answers.", IPS_SCALE) },
	{ config: "agent_praise_complaint", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-praise-vs-complaint", "Agent Arena: Praise vs complaint")], describe: agentText("a task succeeds when the user's explicit praise outnumbers their complaints and fails when complaints outnumber praise.", IPS_SCALE) },
	{ config: "agent_steerability", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-steerability", "Agent Arena: Steerability")], describe: agentText("each assistant turn is scored by how much correcting the user had to do, with repeated corrections counting most.", IPS_SCALE) },
	{ config: "agent_bash_reliability", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-bash-reliability", "Agent Arena: Bash reliability")], describe: agentText("every bash call is a success or a failure the agent caused, such as a mistyped flag; errors outside its control don't count.", IPS_SCALE) },
	{ config: "agent_bash_recovery_steps", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-bash-recovery", "Agent Arena: Bash recovery")], describe: agentText("this is the earlier bash signal, scoring how agents recover from failed bash calls. Arena replaced it with bash reliability on 12 October 2026, so its last board stays published.", IPS_SCALE) },
	{ config: "agent_tool_hallucination", page: AGENT_PAGE, metric: "ips", benchmarkCategory: "agents", slices: [overall("agentarena-tool-hallucination", "Agent Arena: Tool hallucination")], describe: agentText("this signal scores tool hallucination in agent sessions.", IPS_SCALE) },
];

export type ArenaRow = {
	model_name?: string | null;
	organization?: string | null;
	category?: string | null;
	leaderboard_publish_date?: string | null;
	rating?: number | bigint | null;
	rating_lower?: number | bigint | null;
	rating_upper?: number | bigint | null;
	index_score?: number | bigint | null;
	index_score_ci_lower?: number | bigint | null;
	index_score_ci_upper?: number | bigint | null;
	score?: number | bigint | null;
	score_ci_lower?: number | bigint | null;
	score_ci_upper?: number | bigint | null;
	cost_per_task_p50?: number | bigint | null;
	output_tokens_per_task_p50?: number | bigint | null;
};

/** Systems that aren't one model, e.g. Search's "Amazon-Web-Search-Agent". */
const NOT_A_MODEL = /(?:^|[\s-])agent$/i;
/** "GPT-5.5 (Search)", "Gemini 3 Pro (Grounding)": the model with its search tool, which is the harness. */
const SEARCH_TOOL = /\s*\((search|grounding)(?:,\s*([^)]+))?\)\s*$/i;
/** "Grok 4 (0709)", "o3 (2025-04-16)", "Claude 3.7 Sonnet (20250219)": a bracketed release date reads as a dated name. */
const BRACKETED_DATE = /\s*\((\d{4}|\d{8}|\d{4}-\d{2}-\d{2})\)\s*$/;

export function arenaLabel(name: string): { label: string; harness?: string } {
	const tool = name.match(SEARCH_TOOL);
	const label = tool ? `${name.slice(0, tool.index)}${tool[2] ? ` (${tool[2]})` : ""}` : name;
	return { label: label.replace(BRACKETED_DATE, " $1"), harness: tool ? tool[1].toLowerCase() : undefined };
}

function definition(board: Board, slice: Slice): BenchmarkDefinition {
	return {
		id: slice.id,
		name: slice.name,
		url: board.page,
		category: board.benchmarkCategory,
		type: "numerical",
		higherIsBetter: true,
		unit: board.metric === "ips" ? "pts" : board.metric === "index" ? "index" : "Elo",
		description: board.describe(slice),
	};
}

/** Parquet int64 columns arrive as bigint. */
const finite = (value: number | bigint | null | undefined) => {
	const number = typeof value === "bigint" ? Number(value) : value;
	return typeof number === "number" && Number.isFinite(number) ? number : undefined;
};

export function parseArenaRows(board: Board, rows: ArenaRow[]): SourceObservation[] {
	const slices = new Map(board.slices.map((slice) => [slice.category, slice]));
	return rows.flatMap((row) => {
		const slice = slices.get(row.category ?? "");
		const name = row.model_name?.trim();
		if (!slice || !name || NOT_A_MODEL.test(name)) return [];
		const [value, low, high] = board.metric === "rating"
			? [row.rating, row.rating_lower, row.rating_upper]
			: board.metric === "index"
				? [row.index_score, row.index_score_ci_lower, row.index_score_ci_upper]
				: [row.score, row.score_ci_lower, row.score_ci_upper];
		const factor = board.metric === "ips" ? 100 : 1;
		const score = finite(value);
		if (score === undefined) return [];
		const [ciLow, ciHigh] = [finite(low), finite(high)];
		return [{
			benchmarkId: slice.id,
			...arenaLabel(name),
			value: score * factor,
			ciLow: ciLow !== undefined ? ciLow * factor : undefined,
			ciHigh: ciHigh !== undefined ? ciHigh * factor : undefined,
			costUsd: finite(row.cost_per_task_p50),
			outputTokens: finite(row.output_tokens_per_task_p50),
			observedOn: row.leaderboard_publish_date ?? undefined,
		}];
	});
}

type TreeEntry = { type?: string; path?: string };

/** The config's `latest` split: every `<config>/latest-*.parquet` shard listed by the Hub tree API. */
async function loadConfig(ctx: SourceContext, config: string): Promise<ArenaRow[]> {
	if (!ctx.fetchBytes) throw new Error("Arena needs a context that can fetch binary data files.");
	const tree = await ctx.fetchJson<TreeEntry[]>(`${HUB}/api/datasets/${DATASET}/tree/main/${config}`);
	const shards = (Array.isArray(tree) ? tree : []).map((entry) => entry.path ?? "").filter((path) => new RegExp(`^${config}/latest-[^/]+\\.parquet$`).test(path)).sort();
	if (!shards.length) throw new Error(`Arena dataset config ${config} has no latest-*.parquet file; the dataset layout may have changed.`);
	const rows: ArenaRow[] = [];
	for (const path of shards) {
		const bytes = await ctx.fetchBytes(`${HUB}/datasets/${DATASET}/resolve/main/${path}`);
		rows.push(...await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }) as ArenaRow[]);
	}
	return rows;
}

export const lmarena: BenchmarkSource = {
	id: "lmarena",
	name: "Arena leaderboards",
	publisher: "Arena",
	url: SITE,
	attribution: "Arena (arena.ai), lmarena-ai/leaderboard-dataset, CC BY 4.0",
	minRows: 11200,
	benchmarks: ARENA_BOARDS.flatMap((board) => board.slices.map((slice) => definition(board, slice))),
	async fetch(ctx) {
		const observations: SourceObservation[] = [];
		for (const board of ARENA_BOARDS) observations.push(...parseArenaRows(board, await loadConfig(ctx, board.config)));
		return observations;
	},
};
