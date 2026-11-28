import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://chessbench.org";
const DATA = `${SITE}/data/leaderboard.json`;

type Setup = {
	name: string;
	model?: string;
	effort?: string | null;
	rating: number;
	deviation?: number;
	provisional?: boolean;
	qualified?: boolean;
	status?: string;
	games?: number;
	avgCost?: number | null;
	avgOutputTokens?: number | null;
};
type Data = { updatedAt?: string; ratingSystem?: string; models: Array<{ name: string; url?: string; setups: Setup[] }> };

export function parseChessbench(data: Data): SourceObservation[] {
	if (!Array.isArray(data?.models)) throw new Error("ChessBench format changed: expected models[].");
	const observedOn = data.updatedAt?.slice(0, 10);
	return data.models.flatMap((model) => (model.setups ?? [])
		// Unqualified, provisional and retired setups aren't on the ranked board.
		.filter((setup) => setup.qualified !== false && !setup.provisional && (setup.status ?? "active") === "active" && Number.isFinite(setup.rating))
		.map((setup) => ({
			benchmarkId: "chessbench",
			label: setup.name || model.name,
			effort: setup.effort || undefined,
			value: setup.rating,
			ciLow: typeof setup.deviation === "number" ? setup.rating - 1.96 * setup.deviation : undefined,
			ciHigh: typeof setup.deviation === "number" ? setup.rating + 1.96 * setup.deviation : undefined,
			costUsd: setup.avgCost ?? undefined,
			outputTokens: setup.avgOutputTokens || undefined,
			note: setup.games ? `${setup.games} games` : undefined,
			observedOn,
			url: model.url,
		})));
}

export const chessbench: BenchmarkSource = {
	id: "chessbench",
	name: "ChessBench",
	publisher: "MadeByLupu",
	url: SITE,
	attribution: "ChessBench by MadeByLupu (chessbench.org)",
	minRows: 20,
	benchmarks: [
		{
			id: "chessbench",
			name: "ChessBench (Elo)",
			url: SITE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "Elo",
			description: "Each model and reasoning-effort setup plays chess games against other LLMs under shared rules. Glicko-2 rating within this benchmark only, not comparable to Chess.com or FIDE ratings, with cost and output tokens per game.",
		},
	],
	async fetch(ctx) {
		return parseChessbench(await ctx.fetchJson<Data>(DATA));
	},
};
