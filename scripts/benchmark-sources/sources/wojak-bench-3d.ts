import { htmlTable, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/** Wojak-Bench 3D (Andon Labs) renders its rating table server-side; there is no separate data file. */
const PAGE = "https://wojak-bench.dev.pion.dev/";

export function parseWojakBench(html: string): SourceObservation[] {
	const [header, ...rows] = htmlTable(html, 0);
	const model = header?.findIndex((cell) => /^model$/i.test(cell)) ?? -1;
	const rating = header?.findIndex((cell) => /^rating$/i.test(cell)) ?? -1;
	if (model < 0 || rating < 0) throw new Error("Wojak-Bench 3D format changed: expected model and rating columns.");
	return rows.flatMap((cells) => {
		const value = parseNumber(cells[rating]);
		const label = cells[model]?.trim();
		return value === null || !label ? [] : [{ benchmarkId: "wojak-bench-3d", label, value }];
	});
}

export const wojakBench3d: BenchmarkSource = {
	id: "wojak-bench-3d",
	name: "Wojak-Bench 3D",
	publisher: "Andon Labs",
	url: PAGE,
	attribution: "Wojak-Bench 3D by Andon Labs",
	minRows: 6,
	benchmarks: [
		{ id: "wojak-bench-3d", name: "Wojak-Bench 3D", url: PAGE, category: "creativity", type: "numerical", unit: "Elo", higherIsBetter: true, description: "Each model turns the same drawing into a printable 3D figure, and visitors pick the figure that better matches the drawing in blind pairs. Bradley-Terry rating on an Elo-like scale." },
	],
	async fetch(ctx) {
		return parseWojakBench(await ctx.fetchText(PAGE));
	},
};
