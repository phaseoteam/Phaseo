import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://arcprize.org/leaderboard";
const DATA = "https://arcprize.org/media/data/leaderboard";

type Evaluation = {
	datasetId: string;
	modelId: string;
	modelDisplayName: string;
	modelType?: string | null;
	score: number;
	costPerTask?: number | null;
	display?: boolean;
};
type VersionFile = { generatedAt?: string; evaluations: Evaluation[] };

const VERSIONS = [
	{ key: "v1", id: "arc-agi-1", dataset: /^v1_semi_private$/i },
	{ key: "v2", id: "arc-agi-2", dataset: /^v2_semi_private$/i },
	{ key: "v3", id: "arc-agi-3", dataset: /semi_private/i },
] as const;

// Only plain models: human panels, Kaggle ensembles and bespoke refinement systems aren't catalogue models.
const MODEL_TYPES = new Set(["cot", "base llm"]);

export function parseArcVersion(benchmarkId: string, dataset: RegExp, file: VersionFile): SourceObservation[] {
	if (!Array.isArray(file?.evaluations)) throw new Error(`ARC Prize ${benchmarkId} format changed: expected evaluations[].`);
	const observedOn = file.generatedAt?.slice(0, 10);
	return file.evaluations
		.filter((row) => row.display !== false && dataset.test(row.datasetId) && MODEL_TYPES.has((row.modelType ?? "").toLowerCase()) && Number.isFinite(row.score))
		.map((row) => ({
			benchmarkId,
			label: row.modelDisplayName,
			value: row.score * 100,
			costUsd: typeof row.costPerTask === "number" ? row.costPerTask : undefined,
			observedOn,
		}));
}

export const arcPrize: BenchmarkSource = {
	id: "arc-prize",
	name: "ARC Prize leaderboard",
	publisher: "ARC Prize Foundation",
	url: PAGE,
	attribution: "ARC Prize Foundation (arcprize.org)",
	minRows: 150,
	benchmarks: [
		{ id: "arc-agi-1", name: "ARC-AGI-1", url: PAGE, category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Grid puzzles: from a few input and output examples the model infers the transformation and applies it to a new grid. Share of the semi-private evaluation set solved, with cost per task." },
		{ id: "arc-agi-2", name: "ARC-AGI-2", url: PAGE, category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Harder grid puzzles built to need several rules combined, so memorised patterns don't help. Share of the semi-private evaluation set solved, with cost per task." },
		{ id: "arc-agi-3", name: "ARC-AGI-3", url: PAGE, category: "reasoning", type: "percentage", higherIsBetter: true, unit: "%", description: "Interactive game environments: the agent has to work out each game's rules by playing it. Share of the possible score on the semi-private set." },
	],
	async fetch(ctx) {
		const files = await Promise.all(VERSIONS.map((version) => ctx.fetchJson<VersionFile>(`${DATA}/${version.key}.json`)));
		return VERSIONS.flatMap((version, index) => parseArcVersion(version.id, version.dataset, files[index]));
	},
};
