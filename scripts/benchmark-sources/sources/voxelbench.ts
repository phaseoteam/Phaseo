import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://www.voxelbench.ai/leaderboard";
const API = "https://voxelbench.ai/api/leaderboard";
const TRACKS = [
	{ type: "text", id: "voxelbench-text" },
	{ type: "image", id: "voxelbench-image" },
] as const;

type Row = { modelName: string; modelSlug?: string; rating: number; deviation?: number; gamesPlayed?: number };
type File = { leaderboard: Row[]; totalModels?: number; updatedAt?: string };

export function parseVoxelbench(benchmarkId: string, file: File): SourceObservation[] {
	if (!Array.isArray(file?.leaderboard)) throw new Error(`VoxelBench ${benchmarkId} format changed: expected leaderboard[].`);
	if (typeof file.totalModels === "number" && file.leaderboard.length < file.totalModels) throw new Error(`VoxelBench ${benchmarkId}: got ${file.leaderboard.length} of ${file.totalModels} models; raise the limit.`);
	const observedOn = file.updatedAt?.slice(0, 10);
	return file.leaderboard
		.filter((row) => row.modelName && Number.isFinite(row.rating))
		.map((row) => ({
			benchmarkId,
			// "GPT-6.1 Sol (Max)": the effort sits in brackets, which the matcher splits off.
			label: row.modelName,
			value: row.rating,
			ciLow: typeof row.deviation === "number" ? row.rating - 1.96 * row.deviation : undefined,
			ciHigh: typeof row.deviation === "number" ? row.rating + 1.96 * row.deviation : undefined,
			note: row.gamesPlayed ? `${row.gamesPlayed} votes` : undefined,
			observedOn,
		}));
}

export const voxelbench: BenchmarkSource = {
	id: "voxelbench",
	name: "VoxelBench",
	publisher: "VoxelBench",
	url: PAGE,
	attribution: "VoxelBench (voxelbench.ai)",
	minRows: 40,
	benchmarks: [
		{
			id: "voxelbench-text",
			name: "VoxelBench (text)",
			url: PAGE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "rating",
			description: "Models make voxel builds from text prompts, and people vote between two builds. Glicko-2 rating from the votes, with a 95% interval from the rating deviation.",
		},
		{
			id: "voxelbench-image",
			name: "VoxelBench (image)",
			url: PAGE,
			category: "creative",
			type: "numerical",
			higherIsBetter: true,
			unit: "rating",
			description: "Models make voxel builds from image prompts, and people vote between two builds. Glicko-2 rating from the votes, with a 95% interval from the rating deviation.",
		},
	],
	async fetch(ctx) {
		const files = await Promise.all(TRACKS.map((track) => ctx.fetchJson<File>(`${API}?limit=500&type=${track.type}`)));
		return TRACKS.flatMap((track, index) => parseVoxelbench(track.id, files[index]));
	},
};
