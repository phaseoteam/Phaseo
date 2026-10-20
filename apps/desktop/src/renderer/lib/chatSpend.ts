import type { TaskOverview } from "../../shared/workspaceOverview";

/** A chat's own totals, and its agents' (delegated children at any depth that used Phaseo), from the sidebar's overview. */
export function chatSpend(tasks: readonly TaskOverview[], id: string) {
	const children = new Map<string, TaskOverview[]>();
	for (const task of tasks) if (task.delegation?.parentTaskId) children.set(task.delegation.parentTaskId, [...children.get(task.delegation.parentTaskId) ?? [], task]);
	const own = tasks.find(task => task.id === id)?.usageTotals;
	const agents = { tokens: 0, costNanos: 0, count: 0 }, seen = new Set([id]), pending = [...children.get(id) ?? []];
	while (pending.length) {
		const child = pending.pop()!;
		if (seen.has(child.id)) continue;
		seen.add(child.id); pending.push(...children.get(child.id) ?? []);
		const totals = child.usageTotals;
		if (!totals || (!totals.tokens && !totals.costNanos)) continue;
		agents.tokens += totals.tokens; agents.costNanos += totals.costNanos; agents.count++;
	}
	return { own, agents };
}
