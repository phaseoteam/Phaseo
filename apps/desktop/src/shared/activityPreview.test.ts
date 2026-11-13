import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { activityPreviewFrom, previewActivities, previewActivity, previewTask } from "./activityPreview";
import type { AgentActivity, Task } from "./workspace";
import { WorkspaceStore } from "../main/workspaceStore";

const long = "x".repeat(activityPreviewFrom + 1);
const tool = (fields: Partial<AgentActivity>): AgentActivity => ({ id: "u1:t", type: "tool", title: "run_command", text: long, status: "completed", ...fields });

describe("activity previews", () => {
	it("keeps a long tool result's one-line summary and its length", () => {
		const value = previewActivity(tool({ text: `{"command":"pnpm test"}\n${long}` }));
		expect(value.textLength).toBe(long.length + 24);
		expect(value.text.length).toBeLessThanOrEqual(300);
		expect(previewActivity(tool({ text: `{"command": "pnpm test", "output": "${long}"}` })).text).toBe("pnpm test");
	});

	it("leaves long reasoning out", () => {
		expect(previewActivity(tool({ type: "reasoning", title: "Reasoning", status: undefined }))).toMatchObject({ text: "", textLength: long.length });
	});

	it("keeps what is short, running, an edit, a usage report or a plan", () => {
		for (const activity of [tool({ text: "short" }), tool({ status: "running" }), tool({ title: "apply_patch" }), tool({ title: "Edit" }), tool({ type: "usage", title: "Usage" }), tool({ type: "plan", title: "Plan" }), tool({ proposed: {} })]) expect(previewActivity(activity)).toBe(activity);
	});

	it("keeps the chat's latest turn whole and returns the same array when nothing changes", () => {
		const latest = tool({ id: "u2:t" }), older = tool({ id: "u1:t" });
		const result = previewActivities([older, latest], "u2")!;
		expect(result[0].textLength).toBe(long.length);
		expect(result[1]).toBe(latest);
		const kept = [tool({ text: "short" })];
		expect(previewActivities(kept, undefined)).toBe(kept);
		const task = { id: "chat", activities: kept } as Task;
		expect(previewTask(task, undefined)).toBe(task);
	});

	it("reads one activity's full text from the store", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-activity-text-"));
		const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try {
			const created = "2026-11-13T00:00:00.000Z";
			store.saveTask({ id: "chat", title: "Chat", harness: "codex", model: "default", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], createdAt: created, updatedAt: created,
				messages: [{ id: "u1", role: "user", text: "Run it", createdAt: created }, { id: "u2", role: "user", text: "Again", createdAt: created }],
				activities: [tool({ id: "u1:t", text: `first ${long}` }), tool({ id: "loose", text: "no turn" }), tool({ id: "u2:t", text: "second" })] } as Task);
			expect(store.activityText("chat", "u1:t")).toBe(`first ${long}`);
			expect(store.activityText("chat", "loose")).toBe("no turn");
			expect(store.lastUserId("chat")).toBe("u2");
			expect(() => store.activityText("chat", "u9:t")).toThrow("no longer in the chat");
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
