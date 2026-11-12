import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentInputRejectedError } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";

describe("rewind and queued steering in the runtime", () => {
	it("sends a queued message into the running turn, and puts it back in its place when the agent refuses", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-queued-steer-"));
		let finish: (() => void) | undefined;
		const steer = vi.fn();
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); }, steer }));
		try {
			const id = (await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" })).tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(finish).toBeDefined());
			for (const text of ["One", "Two", "Three"]) await runtime.command({ type: "send", id, text });
			const [one, two] = runtime.store.getTask(id).queue;
			await runtime.command({ type: "steer", id, text: two.text, queuedId: two.id });
			expect(runtime.store.getTask(id).queue.map(message => message.text)).toEqual(["One", "Three"]);
			expect(runtime.store.getTask(id).messages.at(-1)).toMatchObject({ id: two.id, text: "Two", delivery: "steer" });
			steer.mockRejectedValueOnce(new AgentInputRejectedError("Not ready"));
			await expect(runtime.command({ type: "steer", id, text: one.text, queuedId: one.id })).rejects.toThrow("stays in the queue");
			expect(runtime.store.getTask(id).queue.map(message => message.text)).toEqual(["One", "Three"]);
			expect(runtime.store.getTask(id).steering).toEqual([]);
			await expect(runtime.command({ type: "steer", id, text: "x", queuedId: "gone" })).rejects.toThrow("no longer queued");
			await expect(runtime.command({ type: "rewind", id, messageId: runtime.store.getTask(id).messages[0].id })).rejects.toThrow("Stop this chat");
			await runtime.command({ type: "cancel", id });
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("regenerates: the last message runs again in a fresh session seeded with the earlier turns", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-regenerate-"));
		const prompts: string[] = [], sessions: (string | undefined)[] = [];
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (task, _cwd, text, callbacks) => { prompts.push(text); sessions.push(task.nativeSessionId); callbacks.onSession(`session-${prompts.length}`); callbacks.onDelta("answer", `Answer ${prompts.length}`); }, cancel: async () => {} }));
		try {
			const id = (await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "chat" })).tasks[0].id;
			await runtime.command({ type: "send", id, text: "First" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			await runtime.command({ type: "send", id, text: "Second" }); await vi.waitFor(() => expect(prompts).toHaveLength(2)); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			const second = runtime.store.getTask(id).messages.findLast(message => message.role === "user")!;
			await runtime.command({ type: "rewind", id, messageId: second.id, resend: true });
			await vi.waitFor(() => expect(prompts).toHaveLength(3)); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(sessions[2]).toBeUndefined();
			expect(prompts[2]).toContain("user: First\n\nassistant: Answer 1"); expect(prompts[2]).not.toContain("Answer 2"); expect(prompts[2]).toMatch(/Second$/);
			expect(runtime.store.getTask(id).messages.map(message => message.text)).toEqual(["First", "Answer 1", "Second", "Answer 3"]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
