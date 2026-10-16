import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceStore } from "./workspaceStore";
import { taskOverview } from "../shared/workspaceOverview";
import { conversationPageOf } from "../shared/conversationPage";
import type { Message } from "../shared/workspace";

describe("stored chat overviews", () => {
	it("follows saves, outside writes, deletes and chats written before the table existed", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-task-overviews-")), filename = path.join(directory, "workspace.sqlite");
		const legacy = new DatabaseSync(filename);
		legacy.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
		legacy.prepare("INSERT INTO tasks VALUES (?, ?)").run("old", JSON.stringify({ id: "old", title: "Older build", harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: null, archived: false, queue: [], messages: [{ id: "u", role: "user", text: "Hi", createdAt: "2026-10-01T00:00:00.000Z", completedAt: "2026-10-01T00:00:05.000Z" }], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }));
		legacy.close();
		const store = new WorkspaceStore(filename);
		try {
			expect(store.getOverview().tasks).toEqual([expect.objectContaining({ id: "old", title: "Older build", pinned: false, lastCompletedAt: "2026-10-01T00:00:05.000Z" })]);
			expect(store.getOverview().tasks[0]).not.toHaveProperty("messages");
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			store.apply({ type: "update-task", id: task.id, title: "Renamed in the app" });
			const listed = store.getOverview().tasks.find(value => value.id === task.id)!;
			expect(listed).toEqual(taskOverview(store.getTask(task.id)));
			// A fixture (or an older build) rewriting data directly must not leave the list stale.
			const outside = new DatabaseSync(filename);
			outside.prepare("UPDATE tasks SET data = json_set(data, '$.title', 'Renamed outside') WHERE id = ?").run(task.id);
			expect(store.getOverview().tasks.find(value => value.id === task.id)?.title).toBe("Renamed outside");
			outside.prepare("DELETE FROM tasks WHERE id = 'old'").run();
			expect(outside.prepare("SELECT count(*) AS count FROM task_overviews WHERE id = 'old'").get()?.count).toBe(0);
			outside.close();
			expect(store.getOverview().tasks.map(value => value.id)).toEqual([task.id]);
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
