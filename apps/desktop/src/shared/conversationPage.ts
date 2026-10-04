import type { AgentActivity, Message } from "./workspace";

export type ConversationPageQuery = { taskId: string; kind: "messages" | "activities"; limit: number; beforeId?: string; afterId?: string; fromId?: string };
export type ConversationPage = { kind: "messages" | "activities"; entries: (Message | AgentActivity)[]; earlier: number; later: number; revision: number };

export function validateConversationPageQuery(value: unknown): ConversationPageQuery {
	if (!value || typeof value !== "object") throw new Error("Invalid conversation page request.");
	const input = value as Record<string, unknown>;
	const validId = (id: unknown) => typeof id === "string" && id.length > 0 && id.length <= 200;
	const cursors = [input.beforeId, input.afterId, input.fromId].filter(id => id !== undefined);
	if (!validId(input.taskId) || (input.kind !== "messages" && input.kind !== "activities") || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 100 || cursors.some(id => !validId(id)) || cursors.length > 1) throw new Error("Invalid conversation page request.");
	return { taskId: input.taskId as string, kind: input.kind, limit: input.limit as number, beforeId: input.beforeId as string | undefined, afterId: input.afterId as string | undefined, fromId: input.fromId as string | undefined };
}
