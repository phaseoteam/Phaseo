export type PlanStep = { text: string; status: "pending" | "in_progress" | "completed" | "cancelled" };

export function parsePlanSteps(value: unknown, source: "codex" | "claude" | "acp" | "cursor"): PlanStep[] | undefined {
	if (!Array.isArray(value) || value.length > 200) return;
	const steps: PlanStep[] = [];
	for (const entry of value) {
		if (!entry || typeof entry !== "object") return;
		const item = entry as Record<string, unknown>;
		const text = source === "codex" ? item.step : item.content;
		if (source === "codex" && !["pending", "inProgress", "completed"].includes(item.status as string)) return;
		if (source === "cursor" && !["pending", "inProgress", "completed", "cancelled"].includes(item.status as string)) return;
		const status = item.status === "inProgress" && (source === "codex" || source === "cursor") ? "in_progress" : item.status;
		if (typeof text !== "string" || !text.trim() || text.length > 10000 || !(source === "cursor" ? ["pending", "in_progress", "completed", "cancelled"] : ["pending", "in_progress", "completed"]).includes(status as string)) return;
		steps.push({ text, status: status as PlanStep["status"] });
	}
	return steps;
}
