import { nextFlight } from "../parse";
import type { BenchmarkDefinition, BenchmarkSource, SourceContext, SourceObservation } from "../types";

/**
 * Terminal-Bench publishes every version's official leaderboard on the Harbor hub. The page loads its rows with a
 * Next.js server action (`fetchLeaderboardWithRows`), so we read the leaderboard id from the page, find the action's id
 * in the page's scripts, and call it the way the page does.
 */
const HUB = "https://hub.harborframework.com";

const BOARDS = [
	{ path: "/datasets/terminal-bench/terminal-bench-2/latest", id: "terminal-bench-2.0", name: "Terminal-Bench 2.0", tasks: 89 },
	{ path: "/datasets/terminal-bench/terminal-bench-2-1/latest", id: "terminal-bench-2.1", name: "Terminal-Bench 2.1", tasks: 89 },
	{ path: "/datasets/terminal-bench/terminal-bench/4.0.0", id: "terminal-bench-4.0", name: "Terminal-Bench 4.0", tasks: 66 },
	{ path: "/datasets/terminal-bench/terminal-bench/4.1.0", id: "terminal-bench-4.1", name: "Terminal-Bench 4.1", tasks: 66 },
] as const;

type Labelled = string | { label?: string } | null | undefined;
type HubRow = {
	status?: string;
	metadata?: { model_display?: Labelled; model_org?: Labelled; model_names?: string[]; agent_display?: Labelled; reasoning_effort?: string | null; date?: string };
	metrics?: { accuracy?: number; accuracy_ci95_half_width?: number; n_trials?: number; total_cost_usd?: number; output_tokens?: number; avg_trial_duration_sec?: number };
};
type HubLeaderboard = { title?: string; rows?: HubRow[] };

const labelOf = (value: Labelled) => (typeof value === "string" ? value : value?.label ?? "").trim();
// Some 4.x rows name Anthropic models without the family, e.g. "Opus 5.5".
const withFamily = (model: string, org: string) => (org === "Anthropic" && /^(Opus|Sonnet|Haiku|Fable|Mythos)\b/.test(model) ? `Claude ${model}` : model);

export function parseHubLeaderboard(board: HubLeaderboard, benchmarkId: string): SourceObservation[] {
	if (!Array.isArray(board?.rows)) throw new Error(`Harbor hub ${benchmarkId} format changed: expected rows[].`);
	return board.rows.flatMap((row) => {
		const model = labelOf(row.metadata?.model_display);
		const accuracy = row.metrics?.accuracy;
		// Rows that combine several models aren't one catalogue model.
		const combined = labelOf(row.metadata?.model_org) === "Multiple" || (row.metadata?.model_names?.length ?? 0) > 1 || model === "Multiple";
		if ((row.status ?? "display") !== "display" || !model || combined || typeof accuracy !== "number") return [];
		const half = row.metrics?.accuracy_ci95_half_width;
		const trials = row.metrics?.n_trials;
		return [{
			benchmarkId,
			label: withFamily(model, labelOf(row.metadata?.model_org)),
			effort: row.metadata?.reasoning_effort || undefined,
			harness: labelOf(row.metadata?.agent_display) || undefined,
			value: accuracy,
			ciLow: typeof half === "number" ? Math.max(0, accuracy - half) : undefined,
			ciHigh: typeof half === "number" ? Math.min(100, accuracy + half) : undefined,
			// The board publishes totals across every trial; per-trial figures compare across rows.
			costUsd: trials && typeof row.metrics?.total_cost_usd === "number" ? row.metrics.total_cost_usd / trials : undefined,
			outputTokens: trials && typeof row.metrics?.output_tokens === "number" ? Math.round(row.metrics.output_tokens / trials) : undefined,
			durationSeconds: row.metrics?.avg_trial_duration_sec,
			observedOn: row.metadata?.date,
		}];
	});
}

/** The page's first leaderboard id, from the flight payload's `"leaderboards":[{"id":"…"`. */
export function hubLeaderboardId(html: string): string {
	const id = nextFlight(html).match(/"leaderboards":\[\{"id":"([0-9a-f-]{36})"/)?.[1];
	if (!id) throw new Error("Harbor hub page has no leaderboard.");
	return id;
}

/** The server action reply is RSC lines; line 1 holds the leaderboard with its rows. */
export function hubActionResult(text: string): HubLeaderboard {
	const line = text.split("\n").find((entry) => entry.startsWith("1:"));
	if (!line) throw new Error("Harbor hub action returned no leaderboard.");
	return JSON.parse(line.slice(2)) as HubLeaderboard;
}

async function findActionId(ctx: SourceContext, html: string): Promise<string> {
	const scripts = [...new Set(html.match(/\/_next\/static\/[\w/.-]+\.js/g) ?? [])];
	for (const script of scripts) {
		const js = await ctx.fetchText(`${HUB}${script}`);
		const id = js.match(/createServerReference\)\("([0-9a-f]{40,})"[^)]*"fetchLeaderboardWithRows"\)/)?.[1];
		if (id) return id;
	}
	throw new Error("Harbor hub scripts no longer define fetchLeaderboardWithRows.");
}

const definition = (board: (typeof BOARDS)[number]): BenchmarkDefinition => ({
	id: board.id,
	name: board.name,
	url: `${HUB}${board.path}?tab=leaderboard`,
	category: "agents",
	type: "percentage",
	higherIsBetter: true,
	unit: "%",
	description: `An agent completes ${board.tasks} tasks in a terminal, each checked by tests. Accuracy over repeated trials, with a 95% interval; each row is an agent harness with one model.`,
});

export const terminalBench: BenchmarkSource = {
	id: "terminalbench",
	name: "Terminal-Bench",
	publisher: "Terminal-Bench",
	url: "https://www.tbench.ai/",
	attribution: "Terminal-Bench official leaderboards (tbench.ai, Harbor hub)",
	minRows: 168,
	benchmarks: BOARDS.map(definition),
	async fetch(ctx) {
		const observations: SourceObservation[] = [];
		let actionId: string | undefined;
		for (const board of BOARDS) {
			const page = `${HUB}${board.path}?tab=leaderboard`;
			const html = await ctx.fetchText(page);
			actionId ??= await findActionId(ctx, html);
			const reply = await ctx.fetchText(page, {
				method: "POST",
				headers: { "next-action": actionId, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
				body: JSON.stringify([hubLeaderboardId(html)]),
			});
			observations.push(...parseHubLeaderboard(hubActionResult(reply), board.id));
		}
		return observations;
	},
};
