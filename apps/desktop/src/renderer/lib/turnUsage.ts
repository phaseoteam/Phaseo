import { usageAmounts } from "../../shared/usageAmounts";
import type { AgentActivity } from "../../shared/workspace";

/** A turn's tokens, and its cost in nanodollars when the steps were priced. */
export function turnUsage(activities: AgentActivity[]) {
	const totals: { Input?: number; Output?: number; Total?: number; Cost?: number } = {};
	for (const activity of activities) {
		const step = usageAmounts(activity.text);
		for (const [label, amount] of [["Input", step.input], ["Output", step.output], ["Total", step.total], ["Cost", step.costNanos]] as const) if (amount !== undefined) totals[label] = (totals[label] ?? 0) + amount;
	}
	return totals;
}

/** How full the model's context window was at the turn's last step, when the harness reports the window size. */
export function contextShare(activities: AgentActivity[]) {
	for (const activity of [...activities].reverse()) {
		try {
			const reported = JSON.parse(activity.text) as Record<string, unknown>;
			const window = reported.contextTokens, input = [reported.input_tokens, reported.inputTokens, reported.prompt_tokens].find(value => typeof value === "number");
			if (typeof window === "number" && window > 0 && typeof input === "number") return Math.min(1, input / window);
		} catch { /* not JSON */ }
	}
	return undefined;
}
