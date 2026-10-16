import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceStore } from "./workspaceStore";
import { taskOverview } from "../shared/workspaceOverview";
import { conversationPageOf } from "../shared/conversationPage";
import type { Message } from "../shared/workspace";

describe("stored chat overviews", () => {
	it("lists chats from their rows, as the full conversation would, through saves, tails and deletes", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-task-overviews-")), filename = path.join(directory, "workspace.sqlite");
		const store = new WorkspaceStore(filename);
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			store.apply({ type: "update-task", id: task.id, title: "Renamed in the app" });
			const full = store.getTask(task.id);
			full.messages.push({ id: "u1", role: "user", text: "First", createdAt: "2026-10-16T00:00:00.000Z", completedAt: "2026-10-16T00:00:05.000Z" }, { id: "a1", role: "assistant", text: "Answer", createdAt: "2026-10-16T00:00:05.000Z" });
			full.messages.push({ id: "u2", role: "user", text: "Second", createdAt: "2026-10-16T00:01:00.000Z" }, { id: "a2", role: "assistant", text: "", createdAt: "2026-10-16T00:01:00.000Z" });
			store.saveTask(full);
			const listed = () => store.getOverview().tasks.find(value => value.id === task.id)!;
			expect(listed()).toEqual(taskOverview(store.getTask(task.id)));
			expect(listed()).not.toHaveProperty("messages");
			// A streaming tail holds only the second turn; the first turn's completion still lists.
			const tail = store.getTaskTail(task.id, "u2"); tail.messages[1].text = "Streaming"; store.saveTask(tail);
			expect(listed()).toEqual(taskOverview(store.getTask(task.id)));
			expect(listed()).toMatchObject({ lastCompletedAt: "2026-10-16T00:00:05.000Z", lastUserMessageAt: "2026-10-16T00:01:00.000Z" });
			store.deleteTasks([task.id]);
			expect(store.getOverview().tasks).toEqual([]);
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("pages from the latest entry or a cursor and keeps one oversized entry", () => {
		const messages = Array.from({ length: 10 }, (_, index) => ({ id: `m${index}`, role: "user", text: index === 7 ? "x".repeat(3 * 1024 * 1024) : `Message ${index}`, createdAt: "" })) as Message[];
		const page = (query: object) => conversationPageOf(messages, { taskId: "t", kind: "messages", limit: 3, ...query }, 4);
		expect(page({})).toMatchObject({ entries: [messages[8], messages[9]], earlier: 8, later: 0, revision: 4 });
		expect(page({ beforeId: "m8" })).toMatchObject({ entries: [messages[7]], earlier: 7, later: 2 });
		expect(page({ beforeId: "m7" })).toMatchObject({ entries: [messages[4], messages[5], messages[6]], earlier: 4, later: 3 });
		expect(page({ afterId: "m1" })).toMatchObject({ entries: [messages[2], messages[3], messages[4]], earlier: 2, later: 5 });
		expect(page({ fromId: "m6" })).toMatchObject({ entries: [messages[6]], earlier: 6, later: 3 });
		expect(() => page({ beforeId: "gone" })).toThrow("Conversation position no longer exists");
	});
});
