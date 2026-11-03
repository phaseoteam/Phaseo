import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { validateCommand, type Message, type Task } from "../shared/workspace";

const message = (id: string, role: Message["role"], text: string): Message => ({ id, role, text, createdAt: new Date().toISOString() });

function chat(store: WorkspaceStore, changes: Partial<Task> = {}) {
	const task = store.apply({ type: "create-task", harness: "claude", model: "default", mode: "code", permissionMode: "full-access", projectId: undefined });
	Object.assign(task, { messages: [message("u1", "user", "Fix the login bug"), message("a1", "assistant", "Looking at auth.ts")], status: "completed", nativeSessionId: "native-1" }, changes);
	store.saveTask(task); return store.getTask(task.id);
}

describe("side chats", () => {
	it("copies the chat with its harness and model, asks before acting and leaves the chat untouched", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const parent = chat(store, { autopilot: { capNanos: null, since: new Date().toISOString() }, tags: ["auth"] });
			const side = store.createSideChat(parent.id, "  Why does auth.ts use a cookie?  ");
			expect(side.delegation).toMatchObject({ parentTaskId: parent.id, kind: "side", sourceMessageId: "a1" });
			expect([side.harness, side.model, side.accountId]).toEqual([parent.harness, parent.model, parent.accountId]);
			expect(side.messages.map(value => value.id)).toEqual(["u1", "a1"]);
			// An idle chat's session is forked natively; nothing is replayed as text.
			expect(side.nativeForkFrom).toBe("native-1"); expect(side.handoffFrom).toBeUndefined();
			expect(side.permissionMode).toBe("supervised"); expect(side.autopilot).toBeUndefined(); expect(side.tags).toBeUndefined();
			expect(side.title).toBe("Why does auth.ts use a cookie?");
			// What the copied conversation cost is the main chat's, so its spend does not count it again under the side chat.
			expect(side.usageTotals).toEqual({ tokens: 0, costNanos: 0 });
			expect(side.queue.map(value => value.text)).toEqual(["Why does auth.ts use a cookie?"]);
			const after = store.getTask(parent.id);
			expect([after.queue.length, after.messages.length, after.status, after.permissionMode]).toEqual([0, 2, "completed", "full-access"]);
			expect(() => store.createSideChat(side.id, "again")).toThrow("cannot start another side chat");
		} finally { store.close(); }
	});

	it("starts from a running chat at its last message, seeded as text, and does not count as an agent", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const parent = chat(store, { status: "running", messages: [message("u1", "user", "Fix it"), message("a1", "assistant", "Done"), message("u2", "user", "Now add tests")] });
			const side = store.createSideChat(parent.id, "");
			expect(side.messages.map(value => value.id)).toEqual(["u1", "a1", "u2"]);
			expect(side.nativeForkFrom).toBeUndefined(); expect(side.handoffFrom).toBe("claude");
			expect(side.title).toBe("Side chat"); expect(side.queue).toEqual([]);
			const running = store.getTask(side.id); running.status = "running"; store.saveTask(running);
			expect(store.activeAgentCount()).toBe(0);
			expect(store.getTask(parent.id).status).toBe("running");
		} finally { store.close(); }
	});

	it("brings back the side chat's own questions and replies as one notice, replacing a copy still queued", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const parent = chat(store);
			const side = store.createSideChat(parent.id, "");
			expect(() => store.bringBackSideChat(side.id)).toThrow("after the side chat has replied");
			const answered = store.getTask(side.id);
			answered.messages.push(message("s1", "user", "Why a cookie?"), message("s2", "assistant", "It is httpOnly.")); answered.status = "completed"; store.saveTask(answered);
			store.bringBackSideChat(side.id);
			let queue = store.getTask(parent.id).queue;
			expect(queue).toHaveLength(1);
			expect(queue[0].notice).toMatchObject({ kind: "side-chat", taskId: side.id, summary: "From side chat: Side chat" });
			expect(queue[0].text).toContain("Person: Why a cookie?\n\nSide chat: It is httpOnly.");
			expect(queue[0].text).not.toContain("Fix the login bug");
			const more = store.getTask(side.id); more.messages.push(message("s3", "user", "And CSRF?"), message("s4", "assistant", "SameSite=Lax covers it.")); store.saveTask(more);
			store.bringBackSideChat(side.id);
			queue = store.getTask(parent.id).queue;
			expect(queue).toHaveLength(1); expect(queue[0].text).toContain("SameSite=Lax");
			expect(() => store.bringBackSideChat(parent.id)).toThrow("Only a side chat");
		} finally { store.close(); }
	});

	it("validates the commands", () => {
		expect(validateCommand({ type: "side-chat", id: "a", text: "" })).toMatchObject({ type: "side-chat" });
		expect(() => validateCommand({ type: "side-chat", id: "a" })).toThrow("Invalid text");
		expect(() => validateCommand({ type: "delete-task", id: "a", onlyIfUnused: "yes" })).toThrow("Invalid delete setting");
		expect(validateCommand({ type: "bring-back", id: "a" })).toMatchObject({ type: "bring-back" });
	});
});
