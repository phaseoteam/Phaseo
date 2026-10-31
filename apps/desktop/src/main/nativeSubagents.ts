import type { AgentActivity } from "../shared/workspace";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 8000) => typeof value === "string" ? value.slice(0, max) : "";
export function codexSubagents(value: unknown): AgentActivity[] {
	const item = record(value);
	if (item.type === "subAgentActivity") {
		const id = text(item.agentThreadId, 200);
		if (!id || !["started", "completed", "interrupted"].includes(String(item.kind))) return [];
		const status = item.kind === "started" ? "running" : item.kind === "completed" ? "completed" : "interrupted";
		return [{ id: `native-agent:${id}`, type: "tool", title: text(item.agentPath, 200) || "Codex agent", text: "", nativeAgent: { id, status }, status: status === "interrupted" ? "failed" : status }];
	}
	if (item.type !== "collabAgentToolCall") return [];
	const states = record(item.agentsStates);
	const ids = new Set([...(Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds.filter((id): id is string => typeof id === "string") : []), ...Object.keys(states)]);
	return [...ids].slice(0, 32).map(id => {
		const state = record(states[id]);
		const status = state.status === "completed" ? "completed" : ["errored", "notFound"].includes(String(state.status)) ? "failed" : ["interrupted", "shutdown"].includes(String(state.status)) ? "interrupted" : state.status === "pendingInit" ? "pending" : "running";
		return { id: `native-agent:${id}`, type: "tool", title: "Codex agent", text: text(state.message) || text(item.prompt), nativeAgent: { id, model: text(item.model, 500) || undefined, status }, status: status === "failed" || status === "interrupted" ? "failed" : status === "completed" ? "completed" : "running" };
	});
}
export function claudeSubagent(value: unknown): AgentActivity | undefined {
	const message = record(value), id = text(message.task_id, 200);
	if (message.type !== "system" || !id || message.ambient || message.skip_transcript) return;
	if (!["task_started", "task_progress", "task_notification"].includes(String(message.subtype))) return;
	if (message.subtype === "task_started" && message.task_type && message.task_type !== "local_agent") return;
	const status = message.subtype === "task_notification" ? message.status === "completed" ? "completed" : message.status === "stopped" ? "interrupted" : "failed" : "running";
	return { id: `native-agent:${id}`, type: "tool", title: text(message.description, 200) || "Claude agent", text: text(message.summary) || text(message.prompt), nativeAgent: { id, status }, status: status === "interrupted" ? "failed" : status };
}
