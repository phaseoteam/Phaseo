import type { BenchmarkSource, SourceObservation } from "../types";

const SITE = "https://openttd-bench.com/";
const DATA = `${SITE}data/leaderboard.json`;

type Arm = {
	key: string;
	model: string;
	client?: string;
	effort?: string | null;
	status?: string;
	medians: { profit?: number; value?: number; cost_usd?: number };
	games?: unknown[];
};
type Data = { schema: number; updated?: string; arms: Arm[] };

export function parseOpenttd(data: Data): SourceObservation[] {
	if (data?.schema !== 1 || !Array.isArray(data.arms)) throw new Error("OpenTTD-Bench format changed: expected schema 1 with arms[].");
	// "reference" arms are the human player.
	return data.arms
		.filter((arm) => arm.model && (arm.status === "current" || arm.status === "retired"))
		.flatMap((arm) => {
			const common = {
				label: arm.model,
				effort: arm.effort || undefined,
				harness: arm.client || undefined,
				costUsd: arm.medians.cost_usd,
				note: Array.isArray(arm.games) ? `median of ${arm.games.length} games` : undefined,
				observedOn: data.updated,
			};
			const rows: SourceObservation[] = [];
			if (Number.isFinite(arm.medians.profit)) rows.push({ ...common, benchmarkId: "openttd-bench-profit", value: arm.medians.profit! });
			if (Number.isFinite(arm.medians.value)) rows.push({ ...common, benchmarkId: "openttd-bench-value", value: arm.medians.value! });
			return rows;
		});
}

export const openttd: BenchmarkSource = {
	id: "openttd",
	name: "OpenTTD-Bench",
	publisher: "Dylan Fetch",
	url: SITE,
	attribution: "OpenTTD-Bench by Dylan Fetch (openttd-bench.com)",
	minRows: 14,
	benchmarks: [
		{
			id: "openttd-bench-profit",
			name: "OpenTTD-Bench (operating profit)",
			url: SITE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "£",
			description: "Each model runs a transport company in OpenTTD through game tools, on the same map with the same instructions, for three in-game years. Median final-year operating profit (income minus running costs) across the model's games, with median cost per game.",
		},
		{
			id: "openttd-bench-value",
			name: "OpenTTD-Bench (company value)",
			url: SITE,
			category: "games",
			type: "numerical",
			higherIsBetter: true,
			unit: "£",
			description: "Each model runs a transport company in OpenTTD through game tools, on the same map with the same instructions, for three in-game years. Median final company value across the model's games, with median cost per game.",
		},
	],
	async fetch(ctx) {
		return parseOpenttd(await ctx.fetchJson<Data>(DATA));
	},
};
