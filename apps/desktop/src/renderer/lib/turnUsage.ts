import type { AgentActivity } from "../../shared/workspace";

export function turnUsage(activities: AgentActivity[]) {
	const totals: Record<string, number> = {};
	for (const activity of activities) {
		try {
			const reported = JSON.parse(activity.text) as Record<string, unknown>;
			const value = reported.last && typeof reported.last === "object" ? reported.last as Record<string, unknown> : reported;
			const step: Record<string, number> = {};
			for (const [label, aliases] of Object.entries({ Input: ["input_tokens", "inputTokens", "prompt_tokens"], Output: ["output_tokens", "outputTokens", "completion_tokens"], Total: ["total_tokens", "totalTokens"] })) {
				const amount = aliases.map(key => value[key]).find(item => typeof item === "number" && Number.isFinite(item) && item >= 0);
				if (typeof amount === "number") step[label] = amount;
			}
			if (step.Total === undefined && step.Input !== undefined && step.Output !== undefined) step.Total = step.Input + step.Output;
			for (const [label, amount] of Object.entries(step)) totals[label] = (totals[label] ?? 0) + amount;
		} catch { /* Some providers report human-readable usage; keep its original details. */ }
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
