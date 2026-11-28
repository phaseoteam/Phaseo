import { htmlText, parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * Surge AI boards are Webflow pages with no data file: the leaderboard is server-rendered, one `data-leaderboard-row`
 * per model with the brand ("Claude") and name ("Fable 5.2 (Adaptive/Max)") in separate cells. Other boards' preview
 * cards on the same page use different markup, so only the primary board is read.
 */

const CHARTOGRAPHY = "https://surgehq.ai/leaderboards/chartography";
const SUDO_L7 = "https://surgehq.ai/benchmarks/sudo-l7";

const EFFORT = /\((?:adaptive\/)?(none|minimal|low|medium|high|x-?high|max)(?:\s+reasoning)?\)\s*$/i;

export function parseSurgeBoard(benchmarkId: string, html: string): SourceObservation[] {
	const rows = html.split(/<div\b[^>]*\bdata-leaderboard-row(?:\s|=|>)[^>]*>/i).slice(1);
	if (!rows.length) throw new Error(`Surge ${benchmarkId}: no data-leaderboard-row elements.`);
	return rows.flatMap((row) => {
		const cell = (name: string) => htmlText(row.match(new RegExp(`class="${name}"[^>]*>([\\s\\S]*?)</div>\\s*</div>`))?.[1] ?? "");
		const brand = cell("head-rank-table-brand");
		const name = cell("head-rank-table-name");
		// The score sits in the first `data-score` element, either as its attribute or its text.
		const score = row.match(/<[^>]*\bdata-score="([^"]*)"[^>]*>([^<]*)</);
		const value = parseNumber(score?.[1]) ?? parseNumber(score?.[2]);
		if (!name || value === null) return [];
		const effort = name.match(EFFORT)?.[1]?.toLowerCase().replace("-", "");
		const model = name.replace(EFFORT, "").trim();
		// "Hy" + "Hy4" and "Inkling" + "Inkling" already repeat the brand.
		const label = brand && !model.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${model}` : model;
		return [{ benchmarkId, label, effort, value }];
	});
}

export const surge: BenchmarkSource = {
	id: "surge",
	name: "Surge AI leaderboards",
	publisher: "Surge AI",
	url: "https://surgehq.ai/benchmarks",
	attribution: "Surge AI (surgehq.ai)",
	minRows: 40,
	benchmarks: [
		{ id: "chartography", name: "Chartography", url: CHARTOGRAPHY, category: "multimodal", type: "percentage", higherIsBetter: true, unit: "%", description: "Professional chart understanding: the model reads specialised graphics such as Kaplan-Meier curves, candlestick charts, contour maps, Sankey diagrams and Bode plots and answers questions that need domain-aware, multi-step graphical reasoning. Score (%) on Surge AI's leaderboard." },
		{ id: "surge-sudo-l7", name: "sudo L7", url: SUDO_L7, category: "coding", type: "percentage", higherIsBetter: true, unit: "%", description: "60 agentic coding tasks where the agent must navigate unfamiliar systems, choose architectures, spot hidden risks and know when technically correct code is the wrong thing to ship. Score (%) on Surge AI's leaderboard." },
	],
	async fetch(ctx) {
		const [chartography, sudo] = await Promise.all([ctx.fetchText(CHARTOGRAPHY), ctx.fetchText(SUDO_L7)]);
		return [...parseSurgeBoard("chartography", chartography), ...parseSurgeBoard("surge-sudo-l7", sudo)];
	},
};
