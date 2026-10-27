import { usageAmounts } from "../../shared/usageAmounts";
import type { AgentActivity, Message } from "../../shared/workspace";

/** A turn's tokens, and its cost in nanodollars when the steps were priced. */
export function turnUsage(activities: AgentActivity[]) {
	const totals: { Input?: number; Output?: number; Total?: number; Cost?: number } = {};
	for (const activity of activities) {
		const step = usageAmounts(activity.text);
		for (const [label, amount] of [["Input", step.input], ["Output", step.output], ["Total", step.total], ["Cost", step.costNanos]] as const) if (amount !== undefined) totals[label] = (totals[label] ?? 0) + amount;
	}
	return totals;
}

/** The context the turn's last step sent and the model's window, when the harness reports the window size. */
export function contextUsage(activities: AgentActivity[]) {
	for (const activity of [...activities].reverse()) {
		try {
			const reported = JSON.parse(activity.text) as Record<string, unknown>;
			const window = reported.contextTokens, input = [reported.input_tokens, reported.inputTokens, reported.prompt_tokens].find(value => typeof value === "number");
			if (typeof window === "number" && window > 0 && typeof input === "number") return { used: input, window };
		} catch { /* not JSON */ }
	}
	return undefined;
}

/** How full the model's context window was at the turn's last step, when the harness reports the window size. */
export function contextShare(activities: AgentActivity[]) {
	const usage = contextUsage(activities);
	return usage && Math.min(1, usage.used / usage.window);
}

/** The usage reports of the chat's latest turn that has any, for the composer's context meter. */
export function latestTurnUsage(messages: readonly Message[], activities: readonly AgentActivity[]) {
	for (const message of [...messages].reverse()) {
		if (message.role !== "user") continue;
		const reports = activities.filter(activity => activity.type === "usage" && activity.id.startsWith(`${message.id}:`));
		if (reports.length) return reports;
	}
	return [];
}
