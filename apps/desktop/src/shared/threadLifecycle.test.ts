import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../main/workspaceStore";
import { validateCommand } from "./workspace";
import { autoSettleAt, hasWoken, isSnoozed, isUnread, settleBlocker, shortDuration, sidebarSection, snoozePresets, type ThreadLifecycle } from "./threadLifecycle";
import { codeSections, nextAfterParking } from "../renderer/shell/codeThreads";
import type { TaskOverview } from "./workspaceOverview";

const day = 86_400_000, now = Date.parse("2026-10-15T12:00:00Z");
const iso = (offset: number) => new Date(now + offset).toISOString();
const thread = (patch: Partial<ThreadLifecycle> = {}): ThreadLifecycle => ({ pinned: false, archived: false, status: "completed", createdAt: iso(-10 * day), updatedAt: iso(-10 * day), approvalsCount: 0, answersCount: 0, ...patch });

describe("Code chat lifecycle", () => {
	it("refuses to settle a chat that is running, waiting on the person or has a queued message", () => {
		expect(settleBlocker(thread({ status: "running" }))).toMatch("still running");
		expect(settleBlocker(thread({ approvalsCount: 1 }))).toMatch("approval or question");
		expect(settleBlocker(thread({ queueCount: 1 }))).toMatch("queued message");
		expect(settleBlocker(thread())).toBeUndefined();
	});

	it("puts snoozed before settled before pinned, and wakes early when the chat needs the person or finishes", () => {
		const snoozed = thread({ snoozedUntil: iso(day), snoozedAt: iso(-day), settledOverride: "settled", pinned: true });
		expect(sidebarSection(snoozed, now)).toBe("snoozed");
		expect(sidebarSection({ ...snoozed, snoozedUntil: iso(-1) }, now)).toBe("settled");
		expect(sidebarSection(thread({ pinned: true }), now)).toBe("pinned");
		expect(isSnoozed({ ...snoozed, approvalsCount: 1 }, now)).toBe(false);
		expect(isSnoozed({ ...snoozed, lastCompletedAt: iso(-1000) }, now)).toBe(false);
		expect(hasWoken({ ...snoozed, lastCompletedAt: iso(-1000) }, now)).toBe(true);
		expect(isSnoozed({ ...snoozed, lastCompletedAt: iso(-2 * day) }, now)).toBe(true);
	});

	it("counts a finished turn as unread only after the chat was first opened", () => {
		expect(isUnread(thread({ lastCompletedAt: iso(-1) }))).toBe(false);
		expect(isUnread(thread({ lastCompletedAt: iso(-1), lastVisitedAt: iso(-2) }))).toBe(true);
		expect(isUnread(thread({ lastCompletedAt: iso(-2), lastVisitedAt: iso(-1) }))).toBe(false);
	});

	it("auto-settles idle chats at their last activity, never pinned, busy, un-settled or opted-out ones", () => {
		expect(autoSettleAt(thread({ lastUserMessageAt: iso(-5 * day) }), 3, now)).toBe(iso(-5 * day));
		expect(autoSettleAt(thread({ lastUserMessageAt: iso(-day) }), 3, now)).toBeUndefined();
		expect(autoSettleAt(thread(), null, now)).toBeUndefined();
		for (const patch of [{ pinned: true }, { status: "running" }, { settledOverride: "active" as const }, { autoSettle: false }, { answersCount: 1 }]) expect(autoSettleAt(thread(patch), 3, now)).toBeUndefined();
		// Waking a chat restarts its clock.
		expect(autoSettleAt(thread({ lastSnoozeWakeAt: iso(-day) }), 3, now)).toBeUndefined();
	});

	it("follows the pull request rules", () => {
		const pr = (state: "open" | "closed" | "merged", at: number) => ({ snapshot: { state, updatedAt: iso(at) } });
		const rules = { days: 3, onMerge: true, keepPullRequests: false };
		// An open or unread pull request holds even an idle chat.
		expect(autoSettleAt(thread({ pullRequests: [pr("open", -9 * day)] }), rules, now)).toBeUndefined();
		expect(autoSettleAt(thread({ pullRequests: [{}] }), rules, now)).toBeUndefined();
		// Merged or closed after the last message settles it at that moment, even with recent activity.
		expect(autoSettleAt(thread({ lastUserMessageAt: iso(-2 * 3_600_000), pullRequests: [pr("merged", -3_600_000)] }), rules, now)).toBe(iso(-3_600_000));
		expect(autoSettleAt(thread({ lastUserMessageAt: iso(-2 * 3_600_000), pullRequests: [pr("merged", -3_600_000)] }), { ...rules, onMerge: false }, now)).toBeUndefined();
		expect(autoSettleAt(thread({ lastUserMessageAt: iso(-2 * 3_600_000), pullRequests: [pr("closed", -3_600_000)] }), { ...rules, onMerge: false }, now)).toBe(iso(-3_600_000));
		// Merged before the person wrote again: inactivity decides, unless chats with a pull request are kept.
		const reopened = thread({ lastUserMessageAt: iso(-5 * day), pullRequests: [pr("merged", -6 * day)] });
		expect(autoSettleAt(reopened, rules, now)).toBe(iso(-5 * day));
		expect(autoSettleAt(reopened, { ...rules, keepPullRequests: true }, now)).toBeUndefined();
	});

	it("offers the snooze presets and short durations", () => {
		const morning = new Date(2026, 9, 15, 9, 0, 0);
		expect(snoozePresets(morning).map(preset => preset.label)).toEqual(["In 1 hour", "In 3 hours", "This evening", "Tomorrow", "Next week"]);
		expect(snoozePresets(new Date(2026, 9, 15, 17, 30)).map(preset => preset.label)).not.toContain("This evening");
		// On a Sunday, tomorrow and next week are the same Monday morning.
		expect(snoozePresets(new Date(2026, 9, 18, 9)).map(preset => preset.label)).not.toContain("Next week");
		expect([shortDuration(10_000), shortDuration(4 * 60_000), shortDuration(2 * 3_600_000), shortDuration(3 * day)]).toEqual(["now", "4m", "2h", "3d"]);
	});

	it("orders Code chats for the sidebar and picks the next chat after parking one", () => {
		const projects = [{ id: "p", name: "App", directory: "/app" }] as never;
		const task = (id: string, patch: Partial<TaskOverview>) => ({ ...thread(), id, title: id, projectId: "p", harness: "codex", model: "m", mode: "code", attentionKey: "", steeringReviewCount: 0, ...patch }) as TaskOverview;
		const sections = codeSections([
			task("old", { createdAt: iso(-3 * day) }), task("new", { createdAt: iso(-day) }), task("back", { createdAt: iso(-9 * day), unsettledAt: iso(-1000) }),
			task("pin", { pinned: true }), task("later", { snoozedUntil: iso(2 * day), snoozedAt: iso(-1) }), task("soon", { snoozedUntil: iso(day), snoozedAt: iso(-1) }),
			task("done", { settledOverride: "settled", settledAt: iso(-day) }), task("chat", { projectId: undefined }),
		], projects, "", now);
		expect(sections.pinned.map(value => value.id)).toEqual(["pin"]);
		expect(sections.active.map(value => value.id)).toEqual(["back", "new", "old"]);
		expect(sections.snoozed.map(value => value.id)).toEqual(["soon", "later"]);
		expect(sections.settled.map(value => value.id)).toEqual(["done"]);
		expect(nextAfterParking(sections, "new")?.id).toBe("old");
		// Dragged chats keep their order: pinned ones first among the pinned, never-dragged ones first among the active.
		const dragged = codeSections([task("a", { orderKey: 2 }), task("b", { orderKey: 1 }), task("fresh", { createdAt: iso(-1) }), task("p2", { pinned: true }), task("p1", { pinned: true, orderKey: 1 })], projects, "", now);
		expect(dragged.active.map(value => value.id)).toEqual(["fresh", "b", "a"]);
		expect(dragged.pinned.map(value => value.id)).toEqual(["p1", "p2"]);
		expect(nextAfterParking(sections, "old")?.id).toBe("new");
	});
});

describe("lifecycle commands", () => {
	it("settles, un-settles, snoozes, wakes and tracks reads without moving the chat", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-lifecycle-")); const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "m", mode: "code" });
			const updatedAt = store.getTask(task.id).updatedAt;
			store.apply({ type: "update-task", id: task.id, pinned: true });
			store.apply(validateCommand({ type: "settle", id: task.id }) as never);
			let current = store.getTask(task.id);
			expect([current.settledOverride, current.pinned, typeof current.settledAt]).toEqual(["settled", false, "string"]);
			const overview = store.getOverview().tasks.find(value => value.id === task.id)!;
			expect(overview.settledOverride).toBe("settled");
			store.apply({ type: "unsettle", id: task.id });
			current = store.getTask(task.id);
			expect([current.settledOverride, current.settledAt, typeof current.unsettledAt]).toEqual(["active", undefined, "string"]);
			expect(() => store.apply({ type: "snooze", id: task.id, until: new Date(Date.now() - 1000).toISOString() })).toThrow("future");
			store.apply({ type: "snooze", id: task.id, until: new Date(Date.now() + day).toISOString() });
			expect(store.getOverview().tasks.find(value => value.id === task.id)?.snoozedUntil).toBeTruthy();
			// Pinning wakes a snoozed chat; a new message brings a settled chat back.
			store.apply({ type: "update-task", id: task.id, pinned: true });
			current = store.getTask(task.id);
			expect([current.snoozedUntil, typeof current.lastSnoozeWakeAt]).toEqual([undefined, "string"]);
			store.apply({ type: "settle", id: task.id });
			store.apply({ type: "send", id: task.id, text: "More, please" });
			current = store.getTask(task.id);
			expect([current.settledOverride, typeof current.unsettledAt]).toEqual([undefined, "string"]);
			expect(() => store.apply({ type: "settle", id: task.id })).toThrow("queued message");
			expect(() => store.apply({ type: "mark-unread", id: task.id })).toThrow("no finished turn");
			store.apply({ type: "visit", id: task.id, at: "2026-10-15T10:00:00Z" });
			store.apply({ type: "visit", id: task.id, at: "2026-10-15T09:00:00Z" });
			expect(store.getTask(task.id).lastVisitedAt).toBe("2026-10-15T10:00:00.000Z");
			store.apply({ type: "auto-settle", id: task.id, enabled: false });
			expect(store.getOverview().tasks.find(value => value.id === task.id)?.autoSettle).toBe(false);
			expect(updatedAt <= store.getTask(task.id).updatedAt).toBe(true);
			expect(() => validateCommand({ type: "snooze", id: task.id, until: "soon" })).toThrow("snooze time");
			expect(() => validateCommand({ type: "auto-settle", id: task.id, enabled: "yes" })).toThrow();
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("deletes chats with their attachments and leaves others alone", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-delete-")); const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try {
			const doomed = store.apply({ type: "create-task", harness: "codex", model: "m", mode: "code" });
			const kept = store.apply({ type: "create-task", harness: "codex", model: "m", mode: "code" });
			const attachment = { id: "00000000-0000-4000-8000-000000000001", taskId: doomed.id, name: "a.txt", kind: "text" as const, mimeType: "text/plain", size: 1 };
			store.saveAttachment(attachment);
			expect(store.deleteTasks([doomed.id])).toEqual([attachment]);
			expect(() => store.getTask(doomed.id)).toThrow();
			expect(store.getAttachment(attachment.id)).toBeUndefined();
			expect(store.getTask(kept.id).id).toBe(kept.id);
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
