import { htmlTable, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

const PAGE = "https://clockbench.ai/";

/** ClockBench publishes no data file; its leaderboard is a server-rendered table (Rank, Model, Accuracy, Lab). */
export function parseClockbench(html: string): SourceObservation[] {
	const [header, ...rows] = htmlTable(html);
	const model = header?.findIndex((cell) => /^model$/i.test(cell)) ?? -1;
	const accuracy = header?.findIndex((cell) => /^accuracy$/i.test(cell)) ?? -1;
	const rank = header?.findIndex((cell) => /^rank$/i.test(cell)) ?? -1;
	if (model < 0 || accuracy < 0 || rank < 0) throw new Error("ClockBench format changed: expected Rank, Model and Accuracy columns.");
	return rows.flatMap((cells): SourceObservation[] => {
		// Human baselines have no rank.
		if (!/^\d+$/.test(cells[rank] ?? "")) return [];
		const value = parseNumber(cells[accuracy]);
		if (value === null || !cells[model]) return [];
		// "Claude Fable 5.2 Max": the matcher splits the trailing effort off.
		return [{ benchmarkId: "clockbench", label: cells[model], value }];
	});
}

export const clockbench: BenchmarkSource = {
	id: "clockbench",
	name: "ClockBench",
	publisher: "ClockBench",
	url: PAGE,
	attribution: "ClockBench (clockbench.ai)",
	minRows: 25,
	benchmarks: [
		{
			id: "clockbench",
			name: "ClockBench",
			url: PAGE,
			category: "vision",
			type: "percentage",
			higherIsBetter: true,
			unit: "%",
			description: "The model answers 720 questions about 180 analog clocks with 36 different faces, to test whether it can read them. Accuracy across the questions; the average human scores 90.7%.",
		},
	],
	async fetch(ctx) {
		return parseClockbench(await ctx.fetchText(PAGE));
	},
};
