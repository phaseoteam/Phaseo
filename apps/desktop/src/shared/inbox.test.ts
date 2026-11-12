import { describe, expect, it } from "vitest";
import type { Task } from "./workspace";
import type { TaskOverview } from "./workspaceOverview";
import { inboxLists, inboxReason, needsAttention, silentFor } from "./inbox";

describe("task inbox", () => {
	it("keeps unresolved requests visible after review and excludes archives", () => {
		const task = { status: "completed", approvals: [{ id: "approval" }], inboxReadAt: "read" } as Task;
		expect(inboxReason(task)).toBe("Approval needed"); expect(needsAttention(task)).toBe(true);
		task.archived = true; expect(inboxReason(task)).toBeUndefined(); expect(needsAttention(task)).toBe(false);
	});
	it("includes uncertain steering on an otherwise completed task", () => {
		const task = { status: "completed", steering: [{ status: "unconfirmed" }] } as Task;
		expect(inboxReason(task)).toBe("Review pending instruction"); expect(needsAttention(task)).toBe(true);
		task.steering = []; expect(inboxReason(task)).toBe("Task completed"); expect(needsAttention(task)).toBe(false);
	});
});

describe("Inbox lists", () => {
	const now = Date.parse("2026-10-20T12:00:00.000Z");
	const task = (id: string, fields: Partial<TaskOverview>) => ({ id, title: id, status: "completed", archived: false, updatedAt: "2026-10-20T10:00:00.000Z", createdAt: "2026-10-20T09:00:00.000Z", approvalsCount: 0, answersCount: 0, steeringReviewCount: 0, ...fields }) as TaskOverview;
	it("lists what needs the person, newest first, leaving out finished, archived, settled and snoozed chats", () => {
		const { needsYou } = inboxLists([
			task("answer", { attentionReason: "Answer needed", updatedAt: "2026-10-20T11:00:00.000Z" }),
			task("agent", { attentionReason: "Approval needed", delegation: { parentTaskId: "answer" } as TaskOverview["delegation"], updatedAt: "2026-10-20T11:30:00.000Z" }),
			task("failed", { status: "failed", attentionReason: "Task failed" }),
			task("done", { attentionReason: "Task completed" }),
			task("archived", { archived: true, attentionReason: "Answer needed" }),
			task("settled", { status: "failed", attentionReason: "Task failed", settledOverride: "settled" }),
			task("snoozed", { status: "failed", attentionReason: "Task failed", snoozedUntil: "2026-10-21T00:00:00.000Z", snoozedAt: "2026-10-20T11:00:00.000Z" }),
			// A snoozed chat that asks for something raises its hand and is listed.
			task("raised", { attentionReason: "Answer needed", answersCount: 1, snoozedUntil: "2026-10-21T00:00:00.000Z", snoozedAt: "2026-10-20T09:30:00.000Z" }),
		], now);
		expect(needsYou.map(value => value.id)).toEqual(["agent", "answer", "failed", "raised"]);
	});
	it("lists chats Autopilot is still running, but not their agents, chats it handed back, or chats already waiting on the person", () => {
		const { inAutopilot, needsYou } = inboxLists([
			task("running", { status: "running", updatedAt: "2026-10-20T11:59:30.000Z", autopilot: { capNanos: null, since: "2026-10-20T09:00:00.000Z" } }),
			task("stopped", { status: "interrupted", attentionReason: "Task interrupted", updatedAt: "2026-10-20T09:00:00.000Z", autopilot: { capNanos: null, since: "2026-10-20T09:00:00.000Z" } }),
			task("agent", { status: "running", updatedAt: "2026-10-20T11:59:30.000Z", autopilot: { capNanos: null, since: "2026-10-20T09:00:00.000Z", inherited: true } }),
			task("blocked", { autopilot: { capNanos: 5_000_000_000, since: "2026-10-20T09:00:00.000Z", handback: { reason: "blocked", summary: "Needs the API key.", at: "2026-10-20T10:00:00.000Z" } }, attentionReason: "Autopilot needs you" }),
		], now);
		expect(inAutopilot.map(value => value.id)).toEqual(["running"]);
		expect(needsYou.map(value => value.id)).toEqual(["blocked", "stopped"]);
	});
});

describe("silence watchdog", () => {
	const now = Date.parse("2026-10-20T12:00:00.000Z");
	const running = (id: string, quietMs: number, fields: Partial<TaskOverview> = {}) => ({ id, title: id, status: "running", archived: false, updatedAt: new Date(now - quietMs).toISOString(), createdAt: "2026-10-20T09:00:00.000Z", approvalsCount: 0, answersCount: 0, steeringReviewCount: 0, ...fields }) as TaskOverview;
	it("flags a running turn with no output for two minutes, but not one waiting on the person", () => {
		expect(silentFor(running("a", 119_000), now)).toBeUndefined();
		expect(silentFor(running("a", 125_000), now)).toBe(125_000);
		expect(silentFor(running("a", 600_000, { approvalsCount: 1 }), now)).toBeUndefined();
		expect(silentFor(running("a", 600_000, { status: "completed" }), now)).toBeUndefined();
	});
	it("raises one Inbox item that goes once output resumes, and keeps an Autopilot chat in one list", () => {
		const quiet = running("quiet", 185_000, { autopilot: { capNanos: null, since: "" } });
		expect(inboxLists([quiet, running("busy", 5_000)], now).needsYou.map(task => [task.id, task.attentionReason])).toEqual([["quiet", "No response for 3m"]]);
		expect(inboxLists([quiet], now).inAutopilot).toEqual([]);
		expect(inboxLists([{ ...quiet, updatedAt: new Date(now).toISOString() }], now).needsYou).toEqual([]);
	});
});
