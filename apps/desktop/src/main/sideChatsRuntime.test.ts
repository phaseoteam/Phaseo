import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAdapter } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { sideChatNote } from "../shared/sideChats";

describe("side chats in the runtime", () => {
	it("run beside a working chat, survive its Stop, and bring back into it as a notice", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-side-chat-"));
		let releaseMain: (() => void) | undefined;
		const prompts: { id: string; text: string }[] = [];
		const run = vi.fn<AgentAdapter["run"]>(async (task, _cwd, text, callbacks) => {
			prompts.push({ id: task.id, text });
			if (!task.delegation && prompts.length === 1) { await new Promise<void>(resolve => { releaseMain = resolve; }); return; }
			callbacks.onDelta(`reply-${prompts.length}`, task.delegation ? "Because of the cache." : "Noted.");
		});
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => { releaseMain?.(); } }));
		try {
			const id = (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" })).tasks[0].id;
			await runtime.command({ type: "send", id, text: "Make the build faster" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("running"));
			const state = await runtime.command({ type: "side-chat", id, text: "Why is the build slow?" });
			const sideId = state.tasks.find(task => task.delegation?.kind === "side")!.id;
			await vi.waitFor(() => expect(runtime.store.getTask(sideId).status).toBe("completed"));
			// The side chat's first message tells its agent what it is, and the main chat keeps working.
			expect(prompts.find(prompt => prompt.id === sideId)?.text).toContain(sideChatNote.trim());
			expect(runtime.store.getTask(id).status).toBe("running");

			await runtime.command({ type: "send", id: sideId, text: "And the tests?" });
			await vi.waitFor(() => expect(runtime.store.getTask(sideId).messages.filter(message => message.role === "user").length).toBe(3));
			await runtime.command({ type: "cancel", id });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("interrupted"));
			await vi.waitFor(() => expect(runtime.store.getTask(sideId).status).toBe("completed"));
			const followUp = prompts.filter(prompt => prompt.id === sideId).at(-1)?.text;
			expect(followUp).toContain("And the tests?"); expect(followUp).not.toContain(sideChatNote.trim());

			await runtime.command({ type: "bring-back", id: sideId });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			const brought = runtime.store.getTask(id).messages.find(message => message.notice?.kind === "side-chat");
			expect(brought?.notice?.taskId).toBe(sideId);
			expect(brought?.text).toContain("Person: Why is the build slow?");
			expect(brought?.text).toContain("Person: And the tests?");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});

	it("discards a side chat on close only if nothing was sent in it", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-side-chat-close-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, callbacks) => { callbacks.onDelta("reply", "Answer"); }, cancel: async () => {} }));
		try {
			const id = (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "chat" })).tasks[0].id;
			const empty = (await runtime.command({ type: "side-chat", id, text: "" })).tasks.find(task => task.delegation?.kind === "side")!.id;
			// Stopping the main chat stops its agents, not its side chats.
			await runtime.command({ type: "cancel", id });
			expect(runtime.store.getTask(empty).status).toBe("idle");
			await runtime.command({ type: "delete-task", id: empty, onlyIfUnused: true });
			expect(runtime.store.getOverview().tasks.some(task => task.id === empty)).toBe(false);
			const used = (await runtime.command({ type: "side-chat", id, text: "Question" })).tasks.find(task => task.delegation?.kind === "side")!.id;
			await vi.waitFor(() => expect(runtime.store.getTask(used).status).toBe("completed"));
			await runtime.command({ type: "delete-task", id: used, onlyIfUnused: true });
			expect(runtime.store.getTask(used).id).toBe(used);
			// onlyIfUnused never deletes an ordinary chat.
			await runtime.command({ type: "delete-task", id, onlyIfUnused: true });
			expect(runtime.store.getTask(id).id).toBe(id);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
