import { describe, expect, it } from "vitest";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { codeFolders, codeSections, createReturnTracker, isWorking, scopeLabel, withBackgroundWork } from "./codeThreads";

const now = Date.parse("2026-10-16T12:00:00Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const projects = [{ id: "p", name: "App", directory: "/app", createdAt: iso(-1e9) }];
const task = (id: string, patch: Partial<TaskOverview> = {}) => ({ id, title: id, projectId: "p", harness: "codex", model: "m", mode: "code", status: "completed", pinned: false, archived: false, createdAt: iso(-86_400_000), updatedAt: iso(-86_400_000), approvalsCount: 0, answersCount: 0, steeringReviewCount: 0, attentionKey: "", ...patch }) as TaskOverview;

describe("the Working section", () => {
	it("counts running chats and chats waiting on their agents, but never ones that need the person", () => {
		const child = (status: TaskOverview["status"], patch: Partial<TaskOverview> = {}) => task(`child-${status}`, { status, delegation: { parentTaskId: "parent", requestId: "r" } as TaskOverview["delegation"], ...patch });
		expect(isWorking(task("a", { status: "running" }), new Set())).toBe(true);
		expect(isWorking(task("a", { status: "idle", queueCount: 1 }), new Set())).toBe(true);
		expect(isWorking(task("a", { status: "running", approvalsCount: 1 }), new Set())).toBe(false);
		expect(isWorking(task("a", { status: "running", answersCount: 1 }), new Set())).toBe(false);
		expect(isWorking(task("a", { status: "waiting" }), new Set())).toBe(false);
		expect(isWorking(task("a", { status: "failed" }), new Set(["a"]))).toBe(false);
		expect(isWorking(task("a"), new Set())).toBe(false);
		expect([...withBackgroundWork([child("running"), child("completed"), child("idle", { id: "queued", queueCount: 2 })])]).toEqual(["parent"]);
		expect(withBackgroundWork([child("running", { archived: true }), child("completed")]).size).toBe(0);
		expect(isWorking(task("parent"), withBackgroundWork([child("running")]))).toBe(true);
	});

	it("folds working chats out of the active list only, newest message sent first", () => {
		const tasks = [
			task("busy-old", { status: "running", lastUserMessageAt: iso(-60_000), lastCompletedAt: iso(-1) }),
			task("busy-new", { status: "running", lastUserMessageAt: iso(-1_000) }),
			task("pinned-busy", { status: "running", pinned: true }),
			task("idle"), task("asks", { status: "waiting", approvalsCount: 1 }),
		];
		const off = codeSections(tasks, projects, "", now);
		expect(off.working).toEqual([]);
		const on = codeSections(tasks, projects, "", now, { working: true });
		expect(on.working.map(value => value.id)).toEqual(["busy-new", "busy-old"]);
		expect(on.pinned.map(value => value.id)).toEqual(["pinned-busy"]);
		expect(on.active.map(value => value.id).sort()).toEqual(["asks", "idle"]);
	});

	it("orders the list by return time when on, ignoring dragged places", () => {
		const tasks = [task("dragged", { orderKey: 1, createdAt: iso(-9e6) }), task("answered", { lastCompletedAt: iso(-1_000), createdAt: iso(-9e6) }), task("watched", { createdAt: iso(-9e6) })];
		expect(codeSections(tasks, projects, "", now).active.map(value => value.id)).toEqual(["answered", "watched", "dragged"]);
		expect(codeSections(tasks, projects, "", now, { working: true, returnedAt: id => id === "watched" ? now : undefined }).active.map(value => value.id)).toEqual(["watched", "answered", "dragged"]);
	});

	it("remembers when a chat left Working, after a first baseline", () => {
		let clock = now;
		const tracker = createReturnTracker(() => clock);
		tracker.observe([task("a")]);
		expect(tracker.returnedAt("a")).toBeUndefined();
		tracker.observe([task("a", { status: "running" })]);
		clock += 5_000;
		tracker.observe([task("a", { status: "running", approvalsCount: 1 })]);
		expect(tracker.returnedAt("a")).toBe(now + 5_000);
		tracker.observe([]);
		expect(tracker.returnedAt("a")).toBeUndefined();
		tracker.observe(null);
	});
});

describe("project folders, archived projects and the project filter", () => {
	const many = [
		{ id: "a", name: "App", directory: "/app", createdAt: iso(-1e9) },
		{ id: "b", name: "Blog", directory: "/blog", createdAt: iso(-1e9) },
		{ id: "a-tree", name: "App", directory: "/app-tree", createdAt: iso(-1e9), worktree: { sourceProjectId: "a", branch: "fix", baseCommit: "c" } },
		{ id: "old", name: "Old", directory: "/old", createdAt: iso(-1e9), archived: true },
		{ id: "old-tree", name: "Old", directory: "/old-tree", createdAt: iso(-1e9), worktree: { sourceProjectId: "old", branch: "x", baseCommit: "c" } },
	];
	const chats = [
		task("a1", { projectId: "a", status: "idle", lastUserMessageAt: iso(-3000) }),
		task("tree", { projectId: "a-tree", status: "idle", lastUserMessageAt: iso(-1000) }),
		task("b1", { projectId: "b", status: "idle", lastUserMessageAt: iso(-2000) }),
		task("gone", { projectId: "old", status: "idle" }),
		task("gone-tree", { projectId: "old-tree", status: "idle" }),
	];

	it("keeps archived projects' chats, worktrees included, out of the sidebar", () => {
		expect(codeSections(chats, many, "", now).active.map(chat => chat.id).sort()).toEqual(["a1", "b1", "tree"]);
	});

	it("filters by any number of projects, and still reads the old single id", () => {
		expect(codeSections(chats, many, ["b", "a-tree"], now).active.map(chat => chat.id).sort()).toEqual(["b1", "tree"]);
		expect(codeSections(chats, many, "b", now).active.map(chat => chat.id)).toEqual(["b1"]);
		expect(codeSections(chats, many, [], now).active).toHaveLength(3);
		expect([scopeLabel([]), scopeLabel([{ name: "App" }]), scopeLabel([{ name: "App" }, { name: "Blog" }])]).toEqual(["All projects", "App", "2 projects"]);
	});

	it("groups active chats by project, a worktree's under its project, with the latest message's folder first", () => {
		const folders = codeFolders(codeSections(chats, many, "", now).active, many);
		expect(folders.map(folder => [folder.project.id, folder.tasks.map(chat => chat.id).sort()])).toEqual([["a", ["a1", "tree"]], ["b", ["b1"]]]);
	});
});
