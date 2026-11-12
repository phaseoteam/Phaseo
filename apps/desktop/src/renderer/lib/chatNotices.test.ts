import { describe, expect, it } from "vitest";
import { badgeCount, chatNotices } from "./chatNotices";
import type { TaskOverview } from "../../shared/workspaceOverview";

const chat = (id: string, extra: Partial<TaskOverview> = {}) => ({ id, title: `Chat ${id}`, status: "idle", attentionKey: "[]", archived: false, ...extra }) as TaskOverview;

describe("in-app chat notices", () => {
	it("stays quiet on the first overview and for the chat on screen", () => {
		const first = chatNotices(undefined, [chat("a", { attentionReason: "Task completed" })]);
		expect(first.notices).toEqual([]);
		const tasks = [chat("a", { attentionReason: "Task completed", lastCompletedAt: "2" }), chat("b", { attentionReason: "Approval needed", attentionKey: "[1]" })];
		expect(chatNotices(first.next, tasks, "a").notices).toEqual([{ id: "b", chat: "Chat b", title: "Needs approval", type: "info" }]);
	});
	it("says when another chat finishes again, but not about archived, agent or stopped chats", () => {
		const before = chatNotices(undefined, [chat("a", { attentionReason: "Task completed", lastCompletedAt: "1" })]).next;
		expect(chatNotices(before, [chat("a", { attentionReason: "Task completed", lastCompletedAt: "2" })]).notices.map(notice => notice.title)).toEqual(["Finished"]);
		const quiet = [chat("b", { attentionReason: "Task failed", archived: true }), chat("c", { attentionReason: "Task failed", delegation: { parentTaskId: "a" } as never }), chat("d", { attentionReason: "Task interrupted" })];
		expect(chatNotices(new Map(), quiet).notices).toEqual([]);
	});
	it("counts unread chats and those waiting on the person", () => {
		expect(badgeCount([
			chat("a", { lastVisitedAt: "2026-10-01T00:00:00Z", lastCompletedAt: "2026-10-02T00:00:00Z" }),
			chat("b", { approvalsCount: 1 }), chat("c", { status: "waiting" }),
			chat("d", { lastVisitedAt: "2026-10-03T00:00:00Z", lastCompletedAt: "2026-10-02T00:00:00Z" }),
			chat("e", { approvalsCount: 1, archived: true }),
		])).toBe(3);
	});
});
