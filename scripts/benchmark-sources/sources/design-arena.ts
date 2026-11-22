import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "../types";

/**
 * Design Arena (designarena.ai): people vote between anonymous generations for the same design prompt. Its leaderboard
 * page reads `/api/leaderboard?arenaType=…&category=…`, which returns Bradley-Terry ratings with standard errors.
 * Builder boards (products such as Lovable or v0) and the "Proprietary Harness Slides" board rank products, not models,
 * so they're left out.
 */
const SITE = "https://www.designarena.ai";

type Board = { arenaType: "models" | "agents"; category: string; id: string; name: string; what: string; benchmarkCategory: string };

const model = (category: string, id: string, name: string, what: string, benchmarkCategory: string): Board => ({ arenaType: "models", category, id, name, what, benchmarkCategory });
const agent = (category: string, id: string, name: string, what: string, benchmarkCategory = "agents"): Board => ({ arenaType: "agents", category, id, name, what, benchmarkCategory });

export const DESIGN_ARENA_BOARDS: Board[] = [
	model("allcategories", "design-arena-overall", "Design Arena (overall)", "designs across all of Design Arena's code categories", "code"),
	model("website", "design-arena-website", "Design Arena: Website", "websites", "code"),
	model("uicomponent", "design-arena-ui-components", "Design Arena: UI components", "UI components", "code"),
	model("gamedev", "design-arena-game-dev", "Design Arena: Game dev", "browser games", "code"),
	model("3d", "design-arena-3d", "Design Arena: 3D", "3D scenes", "3d"),
	model("dataviz", "design-arena-data-viz", "Design Arena: Data visualization", "data visualizations", "code"),
	model("svg", "design-arena-svg", "Design Arena: SVG", "SVG graphics", "code"),
	model("ascii", "design-arena-ascii", "Design Arena: ASCII art", "ASCII art", "creativity"),
	model("logo", "design-arena-logo", "Design Arena: Logo", "logos generated as images", "multimodal"),
	model("graphicdesign", "design-arena-graphic-design", "Design Arena: Graphic design", "graphic designs generated as images", "multimodal"),
	model("image", "design-arena-image", "Design Arena: Image", "images generated from text", "multimodal"),
	model("imagetoimage", "design-arena-image-editing", "Design Arena: Image editing", "edited images", "multimodal"),
	model("video", "design-arena-video", "Design Arena: Video", "videos generated from text", "video"),
	model("imagetovideo", "design-arena-image-to-video", "Design Arena: Image to video", "videos generated from an image", "video"),
	model("videotovideo", "design-arena-video-editing", "Design Arena: Video editing", "edited videos", "video"),
	model("multimodaltovideo", "design-arena-multimodal-to-video", "Design Arena: Multimodal to video", "videos generated from mixed inputs", "video"),
	model("multitovideo", "design-arena-multi-to-video", "Design Arena: Multi to video", "videos generated from several reference inputs", "video"),
	model("tts", "design-arena-tts", "Design Arena: Text to speech", "generated speech", "audio"),
	model("audiorealism", "design-arena-audio-realism", "Design Arena: Audio realism", "speech judged on how human it sounds", "audio"),
	agent("agon_webapps", "design-arena-agent-web-apps", "Design Arena Agents: Web apps", "web apps built by the model as an agent"),
	agent("fullstack", "design-arena-agent-fullstack", "Design Arena Agents: Fullstack", "full-stack apps built by the model as an agent"),
	agent("mobileapps", "design-arena-agent-mobile-apps", "Design Arena Agents: Mobile apps", "mobile apps built by the model as an agent"),
	agent("nativeapps", "design-arena-agent-android-native", "Design Arena Agents: Android native", "native Android apps built by the model as an agent"),
	agent("agentic_gamedev", "design-arena-agent-game-dev", "Design Arena Agents: Game dev", "games built by the model as an agent"),
	agent("agon_godot", "design-arena-agent-godot", "Design Arena Agents: Godot game dev", "Godot games built by the model as an agent"),
	agent("agon_blender", "design-arena-agent-blender-3d", "Design Arena Agents: Blender 3D", "Blender 3D scenes built by the model as an agent", "3d"),
	agent("agon_code_video", "design-arena-agent-code-to-video", "Design Arena Agents: Code to video", "videos the model writes as code, as an agent", "video"),
	agent("agon_slides", "design-arena-agent-pptx-slides", "Design Arena Agents: Python-PPTX slides", "slide decks the model builds with python-pptx as an agent"),
	agent("agon_slides_html", "design-arena-agent-html-slides", "Design Arena Agents: HTML slides", "HTML slide decks built by the model as an agent"),
	agent("agon_pdf", "design-arena-agent-pdf", "Design Arena Agents: PDF", "PDF documents built by the model as an agent"),
	agent("spreadsheet", "design-arena-agent-spreadsheet", "Design Arena Agents: Spreadsheet", "spreadsheets built by the model as an agent"),
];

export type DesignArenaRow = { modelId?: string; elo?: number | null; btStdErr?: number | null; battles?: number | null; winRate?: number | null; avgCostUsd?: number | null; avgGenerationTimeMs?: number | null };
type Response = { success?: boolean; data?: DesignArenaRow[] };

/** Rows that aren't a model: the human reference on Audio Realism. */
const NOT_A_MODEL = new Set(["human"]);

const apiUrl = (board: Board) => `${SITE}/api/leaderboard?arenaType=${board.arenaType}&category=${encodeURIComponent(board.category)}`;

function definition(board: Board): BenchmarkDefinition {
	return {
		id: board.id,
		name: board.name,
		url: `${SITE}/leaderboard`,
		category: board.benchmarkCategory,
		type: "numerical",
		higherIsBetter: true,
		unit: "Elo",
		description: `People compare anonymous ${board.what} made for the same prompt and vote for the better one. Bradley-Terry rating (Design Arena calls it Elo), with a 95% interval from its standard error, average cost and generation time.`,
	};
}

export function parseDesignArena(board: Board, response: Response): SourceObservation[] {
	if (response?.success === false || !Array.isArray(response?.data)) throw new Error(`Design Arena ${board.arenaType}/${board.category} format changed: expected data[].`);
	return response.data.flatMap((row) => {
		const label = row.modelId?.trim();
		if (!label || NOT_A_MODEL.has(label.toLowerCase()) || typeof row.elo !== "number" || !Number.isFinite(row.elo)) return [];
		const error = typeof row.btStdErr === "number" && Number.isFinite(row.btStdErr) ? row.btStdErr : undefined;
		return [{
			benchmarkId: board.id,
			label,
			value: row.elo,
			ciLow: error !== undefined ? row.elo - 1.96 * error : undefined,
			ciHigh: error !== undefined ? row.elo + 1.96 * error : undefined,
			costUsd: typeof row.avgCostUsd === "number" ? row.avgCostUsd : undefined,
			durationSeconds: typeof row.avgGenerationTimeMs === "number" ? row.avgGenerationTimeMs / 1000 : undefined,
			note: typeof row.battles === "number" ? `${row.battles} battles` : undefined,
		}];
	});
}

export const designArena: BenchmarkSource = {
	id: "design-arena",
	name: "Design Arena",
	publisher: "Design Arena",
	url: `${SITE}/leaderboard`,
	attribution: "Design Arena (designarena.ai)",
	minRows: 1480,
	benchmarks: DESIGN_ARENA_BOARDS.map(definition),
	async fetch(ctx) {
		const observations: SourceObservation[] = [];
		for (let index = 0; index < DESIGN_ARENA_BOARDS.length; index += 6) {
			const boards = DESIGN_ARENA_BOARDS.slice(index, index + 6);
			const responses = await Promise.all(boards.map((board) => ctx.fetchJson<Response>(apiUrl(board))));
			boards.forEach((board, position) => observations.push(...parseDesignArena(board, responses[position])));
		}
		return observations;
	},
};
