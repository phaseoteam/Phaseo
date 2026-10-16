import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { WorkspaceStore } from "./workspaceStore";
import { conversationPageOf, type ConversationPageQuery } from "../shared/conversationPage";
import type { AgentActivity, Message, Task } from "../shared/workspace";

const created = "2026-10-16T00:00:00.000Z";
function chat(id: string, turns: number, extra: Partial<Task> = {}): Task {
	const messages: Message[] = [], activities: AgentActivity[] = [];
	for (let n = 0; n < turns; n++) {
		messages.push({ id: `${id}-u${n}`, role: "user", text: `Question ${n}`, createdAt: created, timelineOrder: n * 10 });
		activities.push({ id: `${id}-u${n}:step`, type: "tool", title: "Search", text: `Step ${n}`, status: "completed", timelineOrder: n * 10 + 1 });
		messages.push({ id: `${id}-a${n}`, role: "assistant", text: n === 7 ? "x".repeat(3 * 1024 * 1024) : `Answer ${n}`, createdAt: created, timelineOrder: n * 10 + 9 });
	}
	return { id, title: `Chat ${id}`, harness: "codex", model: "default", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: created, updatedAt: created, ...extra } as Task;
}
function withStore(run: (store: WorkspaceStore, filename: string, raw: DatabaseSync) => void | Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-entries-")), filename = path.join(directory, "workspace.sqlite");
	const store = new WorkspaceStore(filename);
	return Promise.resolve(run(store, filename, (store as unknown as { db: DatabaseSync }).db)).finally(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
}
const changes = (raw: DatabaseSync) => Number((raw.prepare("SELECT total_changes() AS count").get() as { count: number }).count);

describe("chat entries", () => {
	it("writes only the entries that changed", () => withStore((store, _filename, raw) => {
		store.saveTask(chat("long", 500));
		const task = store.getTask("long");
		task.messages[600].text = "Edited";
		const before = changes(raw); store.saveTask(task);
		// One entry, the header and its overview, not a thousand rows.
		expect(changes(raw) - before).toBeLessThan(8);
		expect(store.getTask("long").messages[600].text).toBe("Edited");
		task.messages.splice(998); task.activities!.splice(400); store.saveTask(task);
		expect(store.getTask("long")).toMatchObject({ messages: { length: 998 }, activities: { length: 400 } });
	}));

	it("saves a turn's tail over its own range, even from a copy", () => withStore(store => {
		store.saveTask(chat("long", 300));
		const tail = store.getTaskTail("long", "long-u299");
		expect(tail.messages.map(message => message.id)).toEqual(["long-u299", "long-a299"]);
		expect(tail.activities!.map(activity => activity.id)).toEqual(["long-u299:step"]);
		tail.messages[1].text += " and more";
		tail.messages.push({ id: "long-u299:extra", role: "assistant", text: "Another", createdAt: created, timelineOrder: 3000 });
		tail.activities!.push({ id: "long-u299:next", type: "tool", title: "Read", text: "file", status: "running", timelineOrder: 2999 });
		store.saveTask({ ...tail });
		const whole = store.getTask("long"), seeded = chat("long", 300);
		expect(whole.messages.length).toBe(601);
		expect(whole.messages.slice(0, 598)).toEqual(seeded.messages.slice(0, 598));
		expect(whole.messages.slice(-2).map(message => message.text)).toEqual(["Answer 299 and more", "Another"]);
		expect(whole.activities!.at(-1)?.id).toBe("long-u299:next");
		// The turn's new step is found with its turn, like any other.
		expect(store.getTaskView("long").activities!.map(activity => activity.id)).toContain("long-u299:next");
	}));

	it("adopts conversations written inside the chat row, at open and while open", () => withStore((store, filename) => {
		const outside = new DatabaseSync(filename);
		outside.prepare("INSERT INTO tasks (id, data) VALUES (?, ?)").run("legacy", JSON.stringify(chat("legacy", 20)));
		expect(store.getTask("legacy").messages).toHaveLength(40);
		expect(JSON.parse((outside.prepare("SELECT data FROM tasks WHERE id = 'legacy'").get() as { data: string }).data)).not.toHaveProperty("messages");
		const rewritten = chat("legacy", 21); rewritten.title = "Rewritten outside";
		outside.prepare("UPDATE tasks SET data = ? WHERE id = 'legacy'").run(JSON.stringify(rewritten));
		expect(store.getTask("legacy")).toMatchObject({ title: "Rewritten outside", messages: { length: 42 } });
		expect(store.getOverview().tasks.find(task => task.id === "legacy")?.title).toBe("Rewritten outside");
		outside.prepare("DELETE FROM tasks WHERE id = 'legacy'").run();
		expect(Number((outside.prepare("SELECT count(*) AS count FROM task_entries WHERE task_id = 'legacy'").get() as { count: number }).count)).toBe(0);
		outside.close();
	}));

	it("pages exactly as the conversation page rules do, at every cursor", () => withStore(store => {
		const task = chat("paged", 60); store.saveTask(task);
		const queries: Omit<ConversationPageQuery, "taskId">[] = [{ kind: "messages", limit: 50 }, { kind: "activities", limit: 50 }];
		for (const entry of task.messages.filter((_, index) => index % 7 === 0)) for (const cursor of ["beforeId", "afterId", "fromId"] as const) queries.push({ kind: "messages", limit: 20, [cursor]: entry.id });
		for (const query of queries) {
			const page = store.conversationPage({ taskId: "paged", ...query }), expected = conversationPageOf(query.kind === "messages" ? task.messages : task.activities!, { taskId: "paged", ...query }, page.revision);
			expect({ entries: page.entries, earlier: page.earlier, later: page.later }).toEqual({ entries: expected.entries, earlier: expected.earlier, later: expected.later });
		}
		expect(() => store.conversationPage({ taskId: "paged", kind: "messages", limit: 10, beforeId: "missing" })).toThrow("Conversation position no longer exists");
	}));

	it("waits for another connection's write lock instead of failing", () => withStore(async (store, filename) => {
		store.saveTask(chat("busy", 3));
		const worker = new Worker(`
			const { parentPort, workerData } = require("node:worker_threads");
			const { DatabaseSync } = require("node:sqlite");
			const db = new DatabaseSync(workerData.filename);
			db.exec("BEGIN IMMEDIATE");
			parentPort.postMessage("locked");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
			db.exec("COMMIT"); db.close(); parentPort.postMessage("released");`, { eval: true, workerData: { filename } });
		await new Promise(resolve => worker.once("message", resolve));
		const task = store.getTask("busy"); task.title = "Saved after the lock";
		const started = performance.now(); store.saveTask(task);
		expect(performance.now() - started).toBeGreaterThan(100);
		expect(store.getTask("busy").title).toBe("Saved after the lock");
		await worker.terminate();
	}), 20_000);
});
