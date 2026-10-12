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
