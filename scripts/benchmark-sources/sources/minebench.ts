import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://minebench.ai/leaderboard";
const API = "https://minebench.ai/api/leaderboard";

type Model = {
	slug: string;
	provider?: string;
	displayName: string;
	eloRating?: number;
	rankScore?: number;
	ciLower?: number;
	ciUpper?: number;
	shownCount?: number;
	benchmark?: { averageCostUsd?: number | null; averageTimeMs?: number | null } | null;
};

export function parseMinebench(file: { models: Model[] }): SourceObservation[] {
	if (!Array.isArray(file?.models)) throw new Error("MineBench format changed: expected models[].");
	return file.models
		.filter((model) => model.displayName && Number.isFinite(model.eloRating))
		.map((model) => ({
			benchmarkId: "minebench",
			label: model.displayName,
			value: model.eloRating!,
			ciLow: model.ciLower,
			ciHigh: model.ciUpper,
			costUsd: model.benchmark?.averageCostUsd ?? undefined,
			durationSeconds: model.benchmark?.averageTimeMs ? model.benchmark.averageTimeMs / 1000 : undefined,
			note: model.shownCount ? `${model.shownCount} matchups shown` : undefined,
		}));
}

export const minebench: BenchmarkSource = {
	id: "minebench",
	name: "MineBench",
	publisher: "MineBench",
	url: PAGE,
	attribution: "MineBench (minebench.ai)",
	minRows: 50,
	benchmarks: [
		{
			id: "minebench",
			name: "MineBench",
			url: PAGE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "Models build 3D voxel structures from prompts, and people vote between two builds in a blind arena. Elo rating from the votes with a 95% interval, plus average cost and time per build.",
		},
	],
	async fetch(ctx) {
		return parseMinebench(await ctx.fetchJson<{ models: Model[] }>(API));
	},
};
