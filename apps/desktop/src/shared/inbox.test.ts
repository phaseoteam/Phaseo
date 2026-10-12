import { describe, expect, it } from "vitest";
import type { Task } from "./workspace";
import { inboxReason, needsAttention } from "./inbox";

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
