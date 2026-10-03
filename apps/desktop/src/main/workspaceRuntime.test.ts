import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";

describe("workspace orchestration", () => {
	it("keeps simultaneous approvals visible and cancels unanswered questions", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-requests-"));
		let callbacks: AgentCallbacks | undefined; let finish: (() => void) | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, input) => { callbacks = input; await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" });
			const first = callbacks!.onApproval("write", "First edit"); const second = callbacks!.onApproval("write", "Second edit");
			const question = callbacks!.onQuestion!([{ id: "choice", header: "Scope", question: "Which scope?", options: [{ label: "Small" }] }]);
			const pending = runtime.store.getTask(id); expect(pending.approvals).toHaveLength(2);
			await runtime.command({ type: "approval", id, approvalId: pending.approvals![0].id, decision: "accept" });
			expect(await first).toBe("accept"); expect(runtime.store.getTask(id).status).toBe("waiting");
			await expect(runtime.command({ type: "answer", id, requestId: pending.questions![0].id, answers: { wrong: ["Small"] } })).rejects.toThrow("every question");
			await runtime.command({ type: "cancel", id });
			expect(await second).toBe("decline"); expect(await question).toEqual({});
			await vi.waitFor(() => expect(runtime.store.getTask(id).questions).toEqual([]));
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("serializes queued work and keeps streamed output and native session identity", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-runtime-"));
		const prompts: string[] = [];
		let finish: (() => void) | undefined;
		const adapterFactory = (): AgentAdapter => ({
			run: async (_task, _cwd, text, callbacks) => {
				prompts.push(text); callbacks.onSession("native"); callbacks.onDelta("response", "Reply to "); callbacks.onDelta("response", text);
				callbacks.onActivity?.({ id: "tool", type: "tool", title: "Read file", text: "Started", status: "running" });
				callbacks.onActivity?.({ id: "tool", type: "tool", title: "Read file", text: "Contents", status: "completed" });
				await new Promise<void>(resolve => { finish = resolve; });
			}, cancel: async () => { finish?.(); },
		});
		const runtime = new WorkspaceRuntime(directory, adapterFactory);
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "First" });
			await runtime.command({ type: "send", id, text: "Second" });
			expect(prompts).toEqual(["First"]); expect(runtime.store.getTask(id).queue).toHaveLength(1);
			finish?.(); await vi.waitFor(() => expect(prompts).toEqual(["First", "Second"]));
			expect(runtime.store.getTask(id).nativeSessionId).toBe("native");
			await vi.waitFor(() => expect(runtime.store.getTask(id).messages.filter(message => message.role === "assistant")).toHaveLength(2));
			expect(runtime.store.getTask(id).messages.find(message => message.role === "assistant")?.text).toBe("Reply to First");
			expect(runtime.store.getTask(id).activities?.[0]).toMatchObject({ text: "Contents", status: "completed" });
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("requires an explicit decision and does not drain queued work after cancellation", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-runtime-"));
		let callbacks: AgentCallbacks | undefined;
		let finish: (() => void) | undefined;
		const adapterFactory = (): AgentAdapter => ({
			run: async (_task, _cwd, _text, input) => { callbacks = input; await new Promise<void>(resolve => { finish = resolve; }); },
			cancel: async () => { finish?.(); },
		});
		const runtime = new WorkspaceRuntime(directory, adapterFactory);
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" });
			const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "First" });
			const decision = callbacks!.onApproval("command", "Run command?");
			const approval = runtime.store.getTask(id).approvals![0];
			expect(runtime.store.getTask(id).status).toBe("waiting");
			await expect(runtime.command({ type: "approval", id, approvalId: "wrong", decision: "accept" })).rejects.toThrow("no longer pending");
			await runtime.command({ type: "approval", id, approvalId: approval.id, decision: "decline" });
			expect(await decision).toBe("decline");
			await runtime.command({ type: "send", id, text: "Second" });
			await runtime.command({ type: "cancel", id });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("interrupted"));
			expect(runtime.store.getTask(id).queue).toHaveLength(1);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
