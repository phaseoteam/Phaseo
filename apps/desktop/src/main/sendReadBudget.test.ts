import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentActivity, Message, Task } from "../shared/workspace";
import { WorkspaceRuntime } from "./workspaceRuntime";

/**
 * A budget, not a timing: a turn in a long chat must read about as many stored rows as a turn in a short one. Reading
 * the whole conversation on send cost about 1 s of main-process time per send in a 75,000-entry chat.
 */
const turns = 3_000, rowBudget = 200;
const created = "2026-11-13T00:00:00.000Z";
function longChat(id: string): Task {
	const messages: Message[] = [], activities: AgentActivity[] = [];
	for (let n = 0; n < turns; n++) {
		messages.push({ id: `u${n}`, role: "user", text: `Question ${n}`, createdAt: created, completedAt: created, timelineOrder: n * 10 });
		activities.push({ id: `u${n}:usage`, type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 1_000, output_tokens: 100 }), timelineOrder: n * 10 + 1 });
		messages.push({ id: `a${n}`, role: "assistant", text: `Answer ${n}`, createdAt: created, timelineOrder: n * 10 + 9 });
	}
	return { id, title: "Long chat", harness: "codex", model: "default", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages, activities, createdAt: created, updatedAt: created } as Task;
}

describe("send read budget", () => {
	it(`a turn in a ${turns.toLocaleString("en-GB")}-turn chat reads under ${rowBudget} stored rows`, async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-send-budget-"));
		let seen: Task | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (task, _cwd, _text, callbacks) => { seen = task; callbacks.onDelta("reply", "Done"); }, cancel: async () => {} }));
		try {
			runtime.store.saveTask(longChat("long"));
			const entries = (runtime.store as unknown as { entries: { rows: (...args: unknown[]) => unknown[]; load: (...args: unknown[]) => unknown } }).entries;
			const load = vi.spyOn(entries, "load");
			let rows = 0;
			const read = entries.rows.bind(entries);
			vi.spyOn(entries, "rows").mockImplementation((...args) => { const result = read(...args); rows += result.length; return result; });
			await runtime.command({ type: "send", id: "long", text: "One more" });
			await vi.waitFor(() => { const view = runtime.store.getTaskView("long"); expect(view.messages.at(-1)?.text).toBe("Done"); expect(view.status).toBe("completed"); expect(view.messages.at(-2)?.completedAt).toBeDefined(); });
			expect(load).not.toHaveBeenCalled();
			expect(rows).toBeLessThan(rowBudget);
			// Nothing was lost: the turn landed after every earlier entry.
			load.mockRestore();
			const task = runtime.store.getTask("long");
			expect(task.messages).toHaveLength(turns * 2 + 2);
			expect(task.messages.at(-2)).toMatchObject({ role: "user", text: "One more" });
			expect(task.messages.at(-2)!.timelineOrder).toBeGreaterThan(task.messages.at(-3)!.timelineOrder!);
			expect(task.messages.at(-1)).toMatchObject({ role: "assistant", text: "Done" });
			expect(seen?.id).toBe("long");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	}, 60_000);
});
