import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { handoffPrompt } from "./handoffPrompt";
import { validateCommand, type Task } from "../shared/workspace";

function chat(store: WorkspaceStore, harness: "codex" | "claude" = "codex") {
	const task = store.apply({ type: "create-task", harness, model: "fixture", mode: "code" });
	task.nativeSessionId = "native-session"; task.status = "completed";
	task.messages = [
		{ id: "first", role: "user", text: "First", createdAt: task.createdAt },
		{ id: "first:answer", role: "assistant", text: "Answer one", createdAt: task.createdAt },
		{ id: "second", role: "user", text: "Second @[notes.txt](attachment:file-1)", threadReferences: ["11111111-1111-4111-8111-111111111111"], createdAt: task.createdAt },
		{ id: "second:answer", role: "assistant", text: "Answer two", createdAt: task.createdAt },
		{ id: "third", role: "user", text: "Third", createdAt: task.createdAt },
	];
	task.activities = [
		{ id: "first:tool", type: "tool", title: "Read", text: "First result" }, { id: "loose-before", type: "tool", title: "Note", text: "Before" },
		{ id: "second:tool", type: "tool", title: "Read", text: "Second result" }, { id: "loose-after", type: "tool", title: "Note", text: "After" }, { id: "third:usage:0", type: "usage", title: "Usage", text: "{}" },
	];
	store.saveTask(task);
	return task;
}

describe("rewinding a chat", () => {
	it("removes the message and everything after it from storage, and drops the agent's session", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = chat(store);
			store.apply({ type: "rewind", id: task.id, messageId: "second" });
			const stored = store.getTask(task.id);
			expect(stored.messages.map(message => message.id)).toEqual(["first", "first:answer"]);
			expect(stored.activities?.map(activity => activity.id)).toEqual(["first:tool", "loose-before"]);
			expect(stored.nativeSessionId).toBeUndefined(); expect(stored.handoffFrom).toBe("codex"); expect(stored.queue).toEqual([]);
			// The next turn starts a fresh session seeded with what is left, as a branch does.
			const next: Task = { ...stored, messages: [...stored.messages, { id: "new", role: "user", text: "Edited", createdAt: task.createdAt }] };
			expect(handoffPrompt(next, "Edited")).toContain("<prior-conversation>\nuser: First\n\nassistant: Answer one\n</prior-conversation>");
			// Earlier pages of the conversation read only what is left.
			expect(store.conversationPage({ taskId: task.id, kind: "messages", limit: 50 }).entries).toHaveLength(2);
		} finally { store.close(); }
	});

	it("queues the removed message again to regenerate the answer", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = chat(store, "claude");
			store.apply({ type: "rewind", id: task.id, messageId: "second", resend: true });
			const stored = store.getTask(task.id);
			expect(stored.queue).toHaveLength(1);
			expect(stored.queue[0]).toMatchObject({ text: "Second @[notes.txt](attachment:file-1)", threadReferences: ["11111111-1111-4111-8111-111111111111"] });
			expect(stored.queue[0].id).not.toBe("second");
		} finally { store.close(); }
	});

	it("refuses running chats, answers and unknown messages", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = chat(store);
			expect(() => store.apply({ type: "rewind", id: task.id, messageId: "first:answer" })).toThrow("no longer available");
			expect(() => store.apply({ type: "rewind", id: task.id, messageId: "missing" })).toThrow("no longer available");
			const running = store.getTask(task.id); running.status = "running"; store.saveTask(running);
			expect(() => store.apply({ type: "rewind", id: task.id, messageId: "first" })).toThrow("Stop this chat");
			expect(store.getTask(task.id).messages).toHaveLength(5);
			expect(() => validateCommand({ type: "rewind", id: task.id })).toThrow("messageId");
			expect(() => validateCommand({ type: "rewind", id: task.id, messageId: "first", restoreFiles: "yes" })).toThrow("restoreFiles");
		} finally { store.close(); }
	});
});
