import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";

describe("durable task history pages", () => {
	it("advances task revisions even for a preserved timestamp and a stale snapshot", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			const first = store.getTask(task.id); const stale = store.getTask(task.id);
			first.title = "First update"; store.saveTask(first, true);
			stale.title = "Later update"; store.saveTask(stale, true);
			expect(first.revision).toBe(2); expect(stale.revision).toBe(3);
			expect(store.getTask(task.id)).toMatchObject({ revision: 3, title: "Later update", updatedAt: task.updatedAt });
		} finally { store.close(); }
	});
	it("pages deterministically without returning conversation bodies", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const ids: string[] = [];
			for (let index = 0; index < 155; index++) {
				const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
				task.projectId = index === 0 ? "project-metadata" : undefined;
				task.updatedAt = "2026-10-04T00:00:00.000Z"; task.pinned = index === 0;
				task.messages = [{ id: "message", role: "user", text: "Private conversation body", createdAt: task.updatedAt }];
				store.saveTask(task, true); ids.push(task.id);
			}
			const pages = [0, 50, 100, 150].map(offset => store.taskHistory({ query: "", archived: false, offset, limit: 50 }));
			expect(pages.map(page => page.tasks.length)).toEqual([50, 50, 50, 5]);
			expect(pages.map(page => page.hasMore)).toEqual([true, true, true, false]);
			const results = pages.flatMap(page => page.tasks);
			expect(results.map(task => task.id)).toEqual([ids[0], ...ids.slice(1).sort().reverse()]);
			expect(JSON.stringify(results)).not.toContain("Private conversation body");
			expect(results[0].pinned).toBe(true);
			expect(results[0].projectId).toBe("project-metadata");
			expect(results[1].projectId).toBeUndefined();
		} finally { store.close(); }
	});
	it("searches titles and messages with Unicode casing and literal punctuation, separating archived tasks", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.title = "Résumé";
			task.messages = [{ id: "m", role: "user", text: "100% _ ' \" ; DROP TABLE tasks;", createdAt: task.createdAt }]; store.saveTask(task);
			for (const query of ["RÉSUMÉ", "100%", "_", "'", "DROP TABLE"]) expect(store.taskHistory({ query, archived: false, offset: 0, limit: 10 }).tasks.map(value => value.id)).toEqual([task.id]);
			expect(store.taskHistory({ query: "absent", archived: false, offset: 0, limit: 10 }).tasks).toEqual([]);
			task.archived = true; store.saveTask(task);
			expect(store.taskHistory({ query: "", archived: false, offset: 0, limit: 10 }).tasks).toEqual([]);
			expect(store.taskHistory({ query: "", archived: true, offset: 0, limit: 10 }).tasks[0].id).toBe(task.id);
		} finally { store.close(); }
	});
	it("rejects unbounded and malformed page requests", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const valid = { query: "", archived: false, offset: 0, limit: 50 };
			for (const value of [null, {}, { ...valid, query: "x".repeat(513) }, { ...valid, archived: 0 }, { ...valid, offset: -1 }, { ...valid, offset: 1.5 }, { ...valid, offset: 1_000_001 }, { ...valid, limit: 0 }, { ...valid, limit: 101 }, { ...valid, limit: NaN }]) expect(() => store.taskHistory(value)).toThrow("Invalid task history query");
		} finally { store.close(); }
	});
});
