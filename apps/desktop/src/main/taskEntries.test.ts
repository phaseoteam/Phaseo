import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
		// A command that changes only the header (a rename, a visit) writes only the header row.
		const renamed = changes(raw); store.apply({ type: "update-task", id: "long", title: "Renamed" }); store.apply({ type: "visit", id: "long", at: new Date().toISOString() });
		expect(changes(raw) - renamed).toBe(2);
		expect(store.getTask("long")).toMatchObject({ title: "Renamed", messages: { length: 998 } });
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

	it("sets a database from another layout aside and starts fresh", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-entries-old-")), filename = path.join(directory, "workspace.sqlite");
		const old = new DatabaseSync(filename);
		old.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version=3;");
		old.prepare("INSERT INTO tasks VALUES (?, ?)").run("old", JSON.stringify(chat("old", 2))); old.close();
		const store = new WorkspaceStore(filename);
		try {
			expect(store.getOverview().tasks).toEqual([]);
			expect(existsSync(`${filename}.v3.bak`)).toBe(true);
			store.saveTask(chat("new", 2));
			expect(store.getTask("new").messages).toHaveLength(4);
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("sees another connection's writes, and keeps nothing twice", () => withStore((store, filename, raw) => {
		const task = chat("shared", 4);
		task.activities![0].text = "Long tool output\n".repeat(400);
		store.saveTask(task);
		const other = new WorkspaceStore(filename);
		try {
			const copy = other.getTask("shared"); copy.title = "Renamed elsewhere"; copy.messages[1].text = "Edited elsewhere"; other.saveTask(copy);
			// Cached entries and overviews are dropped once the other connection commits.
			expect(store.getOverview().tasks.find(value => value.id === "shared")?.title).toBe("Renamed elsewhere");
			const mine = store.getTask("shared");
			expect(mine.messages[1].text).toBe("Edited elsewhere");
			mine.messages[2].text = "Edited here"; store.saveTask(mine);
			expect(other.getTask("shared").messages.map(message => message.text).slice(1, 3)).toEqual(["Edited elsewhere", "Edited here"]);
		} finally { other.close(); }
		const rows = raw.prepare("SELECT kind, id, role, timeline_order, bytes, data FROM task_entries ORDER BY rowid").all() as { kind: number; id: string; role: string | null; timeline_order: number; bytes: number; data: string | Uint8Array }[];
		// The id, role and timeline position are columns, not repeated in the data.
		for (const row of rows) if (typeof row.data === "string") expect(row.data).not.toMatch(/"(id|role|timelineOrder)":/);
		// Long tool output is stored compressed; messages stay searchable text.
		const output = rows.find(row => row.kind === 1 && row.bytes > 1024)!;
		expect(output.data).toBeInstanceOf(Uint8Array);
		expect((output.data as Uint8Array).byteLength).toBeLessThan(output.bytes / 10);
		expect(rows.filter(row => row.kind === 0).every(row => typeof row.data === "string")).toBe(true);
		expect(store.taskHistory({ query: "edited here", archived: false, offset: 0, limit: 10 }).tasks.map(value => value.id)).toEqual(["shared"]);
		// Each chat's header holds neither its conversation nor its revision.
		const head = JSON.parse((raw.prepare("SELECT data FROM tasks WHERE id = 'shared'").get() as { data: string }).data);
		expect(head).not.toHaveProperty("messages"); expect(head).not.toHaveProperty("activities"); expect(head).not.toHaveProperty("revision");
	}));

	it("gives deleted chats' pages back and does not reuse their cache", () => withStore((store, _filename, raw) => {
		for (let index = 0; index < 20; index++) store.saveTask(chat(`gone-${index}`, 6));
		store.deleteTasks(Array.from({ length: 20 }, (_, index) => `gone-${index}`));
		expect(Number((raw.prepare("PRAGMA freelist_count").get() as { freelist_count: number }).freelist_count)).toBe(0);
		expect(Number((raw.prepare("SELECT count(*) AS count FROM task_entries").get() as { count: number }).count)).toBe(0);
		// A new chat may take a deleted chat's key; it must not be compared with that chat's entries.
		store.saveTask(chat("fresh", 40));
		expect(store.getTask("fresh").messages).toEqual(chat("fresh", 40).messages.map(message => expect.objectContaining(message)));
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
