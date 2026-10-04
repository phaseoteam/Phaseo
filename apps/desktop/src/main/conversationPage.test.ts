import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { validateConversationPageQuery } from "../shared/conversationPage";

describe("database conversation pages", () => {
	it("reads bounded ordered pages around stable IDs without returning other task bodies", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.messages = Array.from({ length: 1000 }, (_, index) => ({ id: `message-${index}`, role: "user", text: `Literal 世界 ${index}`, createdAt: task.createdAt }));
			task.activities = Array.from({ length: 120 }, (_, index) => ({ id: `activity-${index}`, type: "tool", title: "Tool", text: "Sensitive output", status: "completed" }));
			store.saveTask(task);
			const latest = store.conversationPage({ taskId: task.id, kind: "messages", limit: 50 });
			expect(latest).toMatchObject({ earlier: 950, later: 0, revision: task.revision });
			expect(latest.entries.map(value => value.id)).toEqual(task.messages.slice(950).map(value => value.id));
			expect(JSON.stringify(latest)).not.toContain("Sensitive output");
			const earlier = store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-950", limit: 50 });
			expect(earlier).toMatchObject({ earlier: 900, later: 50 });
			expect(earlier.entries.map(value => value.id)).toEqual(task.messages.slice(900, 950).map(value => value.id));
			task.messages.push({ id: "newest", role: "assistant", text: "Appended", createdAt: task.createdAt }); store.saveTask(task);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-950", limit: 50 }).entries).toEqual(earlier.entries);
			const newer = store.conversationPage({ taskId: task.id, kind: "messages", afterId: "message-949", limit: 50 });
			expect(newer).toMatchObject({ earlier: 950, later: 1 });
			expect(newer.entries).toEqual(latest.entries);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-0", limit: 50 }).entries).toEqual([]);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", afterId: "newest", limit: 50 }).entries).toEqual([]);
			expect(store.conversationPage({ taskId: task.id, kind: "activities", limit: 50 }).entries).toEqual(task.activities.slice(70));
		} finally { store.close(); }
	});
	it("distinguishes empty history, missing tasks and invalidated positions", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			expect(store.conversationPage({ taskId: task.id, kind: "activities", limit: 50 })).toMatchObject({ entries: [], earlier: 0, later: 0 });
			expect(() => store.conversationPage({ taskId: "missing", kind: "messages", limit: 50 })).toThrow("Task no longer exists");
			expect(() => store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "missing", limit: 50 })).toThrow("position no longer exists");
		} finally { store.close(); }
	});
	it("rejects invalid bounds and ambiguous cursors", () => {
		const query = { taskId: "task", kind: "messages", limit: 50 };
		for (const patch of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { kind: "queue" }, { taskId: "" }, { beforeId: "" }, { afterId: "x".repeat(201) }, { beforeId: "one", afterId: "two" }]) expect(() => validateConversationPageQuery({ ...query, ...patch })).toThrow("Invalid conversation page");
	});
});
