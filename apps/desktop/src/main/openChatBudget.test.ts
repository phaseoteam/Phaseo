import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { previewActivities, previewTask } from "../shared/activityPreview";
import { historyPageSizes } from "../shared/chatPreferences";
import type { AgentActivity, Message, Task } from "../shared/workspace";
import { WorkspaceStore } from "./workspaceStore";

/**
 * Budgets, not timings: what the window is sent when it opens a long Code chat and loads an older page. Every turn has
 * eight steps with 5 KB of output each; the window gets those as one-line previews (the latest turn whole). On
 * 11-13 opening it sent 1,058 KB with 50 messages a page and full steps, 508 KB with 25, and 58 KB with previews.
 */
const turns = 600, openBudget = 90 * 1024, pageBudget = 90 * 1024;
const created = "2026-11-13T00:00:00.000Z";
function codeChat(): Task {
	const messages: Message[] = [], activities: AgentActivity[] = [];
	for (let n = 0; n < turns; n++) {
		messages.push({ id: `u${n}`, role: "user", text: `Fix step ${n}`, createdAt: created, completedAt: created, timelineOrder: n * 20 });
		for (let step = 0; step < 8; step++) activities.push({ id: `u${n}:t${step}`, type: "tool", title: "run_command", text: `{"command":"pnpm test ${n}","output":"${"ok ".repeat(1_700)}"}`, status: "completed", timelineOrder: n * 20 + 1 + step });
		messages.push({ id: `a${n}`, role: "assistant", text: `Fixed step ${n}: the handler now retries once.`, createdAt: created, timelineOrder: n * 20 + 19 });
	}
	return { id: "code", title: "Long Code chat", harness: "codex", model: "default", mode: "code", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: created, updatedAt: created } as Task;
}
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

describe("open chat budget", () => {
	it(`opening a ${turns}-turn Code chat sends under ${openBudget / 1024} KB, and an older page under ${pageBudget / 1024} KB`, () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-open-budget-"));
		const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try {
			store.saveTask(codeChat());
			const latest = store.lastUserId("code");
			const view = previewTask(store.getTaskView("code", historyPageSizes.default), latest);
			expect(view.messages).toHaveLength(historyPageSizes.default);
			expect(bytes(view)).toBeLessThan(openBudget);
			// The latest turn is whole; the others are previews that load their text when opened.
			expect(view.activities!.filter(activity => activity.id.startsWith(`${latest}:`)).every(activity => activity.textLength === undefined)).toBe(true);
			expect(view.activities!.some(activity => activity.textLength)).toBe(true);
			const page = store.conversationPage({ taskId: "code", kind: "messages", limit: historyPageSizes.default, beforeId: view.messages[0].id });
			expect(bytes({ ...page, activities: previewActivities(page.activities, latest) })).toBeLessThan(pageBudget);
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
