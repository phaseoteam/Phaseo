import type { Task, TurnSettings } from "./workspace";

/** Agents keep their reasoning level in reasoningEffort or in a model option such as Claude Code's effort. */
export function turnSettings(task: Pick<Task, "harness" | "model" | "reasoningEffort" | "modelOptions">): TurnSettings {
	const option = Object.entries(task.modelOptions ?? {}).find(([id, value]) => /reason|effort|think/i.test(id) && typeof value === "string")?.[1];
	const effort = task.reasoningEffort ?? (typeof option === "string" ? option : undefined);
	return { harness: task.harness, model: task.model, ...(effort ? { effort } : {}) };
}

export const sameTurnSettings = (a: TurnSettings, b: TurnSettings) => a.harness === b.harness && a.model === b.model && (a.effort ?? "") === (b.effort ?? "");

/** "high" → "High", "xhigh" → "Extra high". */
export function effortName(effort: string) {
	const words = effort.replace(/^x(?=high$)/i, "extra ").replace(/[-_]/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}
