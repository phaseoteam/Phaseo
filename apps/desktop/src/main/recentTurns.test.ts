import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { recentTurns, WorkspaceStore } from "./workspaceStore";
import type { AgentActivity, Message, Task } from "../shared/workspace";

const created = "2026-11-13T00:00:00.000Z";
function chat(id: string, turns: number): Task {
	const messages: Message[] = [], activities: AgentActivity[] = [];
	for (let n = 0; n < turns; n++) {
		messages.push({ id: `${id}-u${n}`, role: "user", text: `Question ${n}`, createdAt: created, timelineOrder: n * 10, ...(n === 3 ? { attachments: [{ id: "file-1", name: "notes.txt", mimeType: "text/plain", size: 5, kind: "text" }] } : {}) } as Message);
		activities.push({ id: `${id}-u${n}:usage`, type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 100 + n, output_tokens: 10 }), timelineOrder: n * 10 + 1 });
		messages.push({ id: `${id}-a${n}`, role: "assistant", text: `Answer ${n}`, createdAt: created, timelineOrder: n * 10 + 9 });
	}
	return { id, title: `Chat ${id}`, harness: "phaseo", model: "test/model", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: created, updatedAt: created } as Task;
}
function withStore(run: (store: WorkspaceStore) => void) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-recent-"));
	const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
	try { run(store); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}
const unread = (task: Task) => (task as unknown as Record<symbol, () => boolean>)[Object.getOwnPropertySymbols(task).find(symbol => symbol.description === "unread entries")!]();

describe("reading a long chat's latest turns", () => {
	it("reads the last turns alone and leaves the rest unread", () => withStore(store => {
		store.saveTask(chat("long", 400));
		const task = store.getTask("long");
		expect(recentTurns(task, 1).messages.map(message => message.id)).toEqual(["long-u399", "long-a399"]);
		expect(recentTurns(task, 2).messages.map(message => message.id)).toEqual(["long-u398", "long-a398", "long-u399", "long-a399"]);
		expect(recentTurns(task, 1).activities.map(activity => activity.id)).toEqual(["long-u399:usage"]);
		expect(unread(task)).toBe(true);
		// Once the whole conversation is read, the recent turns are part of it.
		expect(task.messages).toHaveLength(800);
		expect(recentTurns(task, 1).messages).toHaveLength(800);
	}));

	it("returns a plain chat's own arrays", () => {
		const task = chat("plain", 3);
		expect(recentTurns(task, 1).messages).toBe(task.messages);
	});

	it("gives the next timeline position and the messages with attachments, as the whole conversation would", () => withStore(store => {
		const value = chat("long", 50);
		store.saveTask(value);
		const all = [...value.messages, ...value.activities!];
		expect(store.nextTimelineOrder("long")).toBe(Math.max(...all.map(item => item.timelineOrder ?? 0), all.length) + 1);
		expect(store.messagesWithAttachments("long").map(message => message.id)).toEqual(["long-u3"]);
		expect(store.messagesWithAttachments("long")[0].attachments?.[0].name).toBe("notes.txt");
	}));

	it("starts a turn by writing after the latest turn, keeping every earlier entry", () => withStore(store => {
		store.saveTask(chat("long", 300));
		const latest = store.getTaskLatestTurn("long");
		expect(latest.messages.map(message => message.id)).toEqual(["long-u299", "long-a299"]);
		latest.messages.push({ id: "new", role: "user", text: "Next", createdAt: created, timelineOrder: store.nextTimelineOrder("long") });
		store.saveTask(latest);
		const saved = store.getTask("long");
		expect(saved.messages).toHaveLength(601);
		expect(saved.messages.at(-1)).toMatchObject({ id: "new", text: "Next" });
		expect(saved.messages[0].id).toBe("long-u0");
		expect(saved.activities).toHaveLength(300);
	}));

	it("places the next message after every step when the latest message is a steer without a position", () => withStore(store => {
		const value = chat("steered", 10);
		// A steer joins the running turn: no position of its own, and the turn's steps stay with its first message.
		value.messages.push({ id: "steer", role: "user", text: "Also check the tests", createdAt: created });
		store.saveTask(value);
		const highest = Math.max(...[...value.messages, ...value.activities!].map(item => item.timelineOrder ?? 0));
		expect(store.getTaskLatestTurn("steered").messages.map(message => message.id)).toEqual(["steer"]);
		expect(store.nextTimelineOrder("steered", store.getTaskLatestTurn("steered"))).toBeGreaterThan(highest);
	}));
});
