import type { Task } from "./workspace";

export type TaskHistoryQuery = { query: string; archived: boolean; offset: number; limit: number };
export type TaskSummary = Pick<Task, "id" | "title" | "harness" | "status" | "pinned" | "updatedAt">;
export type TaskHistoryPage = { tasks: TaskSummary[]; hasMore: boolean };

export function validateTaskHistoryQuery(value: unknown): TaskHistoryQuery {
	if (!value || typeof value !== "object") throw new Error("Invalid task history query.");
	const input = value as Record<string, unknown>;
	if (typeof input.query !== "string" || input.query.length > 512 || typeof input.archived !== "boolean" || !Number.isSafeInteger(input.offset) || (input.offset as number) < 0 || (input.offset as number) > 1_000_000 || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 100) throw new Error("Invalid task history query.");
	return { query: input.query, archived: input.archived, offset: input.offset as number, limit: input.limit as number };
}
