import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { segmentMatches } from "../shared/conversationSearch";
import type { Message } from "../shared/workspace";

const at = "2026-10-27T10:00:00.000Z";
const message = (id: string, role: Message["role"], text: string): Message => ({ id, role, text, createdAt: at });

describe("find in chat", () => {
	it("finds every message across pages, in order, with counts and the turn to load", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.messages = Array.from({ length: 120 }, (_, index) => index % 2 === 0 ? message(`u${index}`, "user", `Question ${index}`) : message(`a${index}`, "assistant", index === 3 ? "The Needle and the needle" : index === 119 ? "last NEEDLE" : "Nothing here"));
			store.saveTask(task);
			const result = store.findInConversation({ taskId: task.id, query: "needle" });
			expect(result.hits).toEqual([{ id: "a3", turnId: "u2", count: 2 }, { id: "a119", turnId: "u118", count: 1 }]);
			expect(result).toMatchObject({ total: 3, truncated: false });
			expect(store.findInConversation({ taskId: task.id, query: "50%" }).hits).toEqual([]);
		} finally { store.close(); }
	});
	it("rejects empty and unbounded queries", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			for (const value of [null, { taskId: "x" }, { taskId: "x", query: "  " }, { taskId: "x", query: "y".repeat(201) }]) expect(() => store.findInConversation(value)).toThrow("Invalid find request");
		} finally { store.close(); }
	});
	it("maps matches onto rendered text split across nodes", () => {
		expect(segmentMatches(["The Nee", "dle", " and needle"], "needle")).toEqual([
			{ start: { segment: 0, offset: 4 }, end: { segment: 1, offset: 3 } },
			{ start: { segment: 2, offset: 5 }, end: { segment: 2, offset: 11 } },
		]);
		expect(segmentMatches(["abc"], "")).toEqual([]);
	});
});

describe("message search across chats", () => {
	it("returns each chat's latest matching message with a snippet, newest chats first, skipping agents' chats", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const older = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			older.title = "Older"; older.messages = [message("o1", "user", "Plan the Lisbon trip"), message("o2", "assistant", `${"x".repeat(100)} Lisbon has trams.\nAnd more`)];
			older.updatedAt = "2026-10-01T00:00:00.000Z"; store.saveTask(older, true);
			const newer = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			newer.title = "Newer"; newer.messages = [message("n1", "user", "lisbon again")];
			newer.updatedAt = "2026-10-20T00:00:00.000Z"; store.saveTask(newer, true);
			const child = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			child.delegation = { parentTaskId: older.id, requestId: "r" } as never; child.messages = [message("c1", "user", "Lisbon subtask")]; store.saveTask(child);
			const hits = store.searchMessages({ query: "LISBON", limit: 10 });
			expect(hits.map(hit => [hit.title, hit.messageId, hit.matches])).toEqual([["Newer", "n1", 1], ["Older", "o2", 2]]);
			expect(hits[1].snippet.startsWith("…")).toBe(true);
			expect(hits[1].snippet).toContain("Lisbon has trams. And more");
			expect(hits[1]).toMatchObject({ role: "assistant", createdAt: at });
			expect(store.searchMessages({ query: "absent", limit: 10 })).toEqual([]);
			expect(() => store.searchMessages({ query: "a", limit: 51 })).toThrow("Invalid message search");
		} finally { store.close(); }
	});
});
