import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { AgentInputRejectedError } from "./agentAdapter";

describe("workspace orchestration", () => {
	it("sets up execution and publishes streaming changes without reading unrelated conversation bodies", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-metadata-stream-"));
		let callbacks: AgentCallbacks | undefined; let finish: (() => void) | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, value) => { callbacks = value; await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		const changed = vi.fn(); runtime.onChange = changed;
		let fullReads: ReturnType<typeof vi.spyOn> | undefined;
		try {
			fullReads = vi.spyOn(runtime.store, "get").mockImplementation(() => { throw new Error("Full history read during execution"); });
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); const id = state.tasks[0].id;
			expect(state.tasks[0]).not.toHaveProperty("messages");
			await runtime.command({ type: "send", id, text: "Secret input" }); await vi.waitFor(() => expect(callbacks).toBeDefined());
			changed.mockClear();
			callbacks!.onDelta("reply", "Secret streamed response");
			await vi.waitFor(() => expect(runtime.store.getTask(id).messages.some(message => message.text === "Secret streamed response")).toBe(true));
			expect(changed).toHaveBeenCalled(); expect(JSON.stringify(changed.mock.calls)).not.toContain("Secret streamed response");
			for (const [state] of changed.mock.calls) for (const task of state.tasks) expect(task).not.toHaveProperty("messages");
			finish?.(); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(fullReads).not.toHaveBeenCalled();
		} finally { fullReads?.mockRestore(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("keeps instructions queued during account sign-in until explicitly resumed", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-sign-in-queue-"));
		const run = vi.fn(async () => {}); const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			runtime.store.saveAccount({ id: "owned", name: "Owned", harness: "grok", kind: "native", configured: true, configDirectory: directory });
			const state = await runtime.command({ type: "create-task", harness: "grok", accountId: "owned", model: "default", mode: "plan" }); const id = state.tasks[0].id;
			const release = runtime.beginAccountSignIn("owned"); expect(() => runtime.beginAccountSignIn("owned")).toThrow("already in progress");
			await expect(runtime.command({ type: "update-account", id: "owned", archived: true })).rejects.toThrow("Finish or cancel");
			await expect(runtime.command({ type: "update-account", id: "owned", name: "Changed during login" })).rejects.toThrow("Finish or cancel");
			expect(runtime.store.get().accounts.find(account => account.id === "owned")).toMatchObject({ name: "Owned" });
			expect(runtime.store.get().accounts.find(account => account.id === "owned")?.archived).toBeUndefined();
			await runtime.command({ type: "send", id, text: "Retain instruction" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("failed"));
			expect(runtime.store.getTask(id)).toMatchObject({ queue: [{ text: "Retain instruction" }], messages: [], error: expect.stringContaining("sign-in") }); expect(run).not.toHaveBeenCalled();
			release(); const nextRelease = runtime.beginAccountSignIn("owned"); release(); expect(() => runtime.beginAccountSignIn("owned")).toThrow("already in progress"); nextRelease();
			expect(run).not.toHaveBeenCalled(); await runtime.command({ type: "resume", id }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(run).toHaveBeenCalledOnce(); expect(runtime.store.getTask(id).queue).toHaveLength(0);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("prevents native profile sign-in while that account owns an execution", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-account-execution-"));
		let finish: (() => void) | undefined;
		const run = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => { finish?.(); } }));
		try {
			runtime.store.saveAccount({ id: "owned", name: "Owned", harness: "grok", kind: "native", configured: true, configDirectory: directory });
			const state = await runtime.command({ type: "create-task", harness: "grok", accountId: "owned", model: "default", mode: "plan" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
			expect(() => runtime.assertAccountIdle("owned")).toThrow("Stop this account");
			expect(() => runtime.assertAccountIdle("unrelated")).not.toThrow();
			await runtime.command({ type: "cancel", id }); await vi.waitFor(() => expect(() => runtime.assertAccountIdle("owned")).not.toThrow());
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("prevents managed MCP changes during Grok execution and releases the guard after cancellation", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-grok-mcp-"));
		let finish: (() => void) | undefined;
		const run = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => { finish?.(); } }));
		const connection = { id: "fixture", name: "Fixture", transport: "http" as const, url: "https://example.invalid/mcp", enabled: false };
		try {
			const state = await runtime.command({ type: "create-task", harness: "grok", model: "default", mode: "plan" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
			expect(() => runtime.mcp({ type: "save", connection })).toThrow("Stop affected tasks");
			expect(runtime.store.get().mcpConnections).toHaveLength(0);
			await runtime.command({ type: "cancel", id });
			await vi.waitFor(() => expect(() => runtime.mcp({ type: "save", connection })).not.toThrow());
			expect(runtime.store.get().mcpConnections).toEqual([connection]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("retains discovered native models across workspace restart", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-native-models-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, callbacks) => { callbacks.onModels?.([{ id: "native-model", name: "Native model", default: true }]); callbacks.onModes?.([{ id: "analysis", name: "Analysis", default: true }]); }, cancel: async () => {} }));
		let closed = false;
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed")); await runtime.close(); closed = true;
			const restored = new WorkspaceRuntime(directory); try { expect(restored.store.getTask(id).nativeModels).toEqual([{ id: "native-model", name: "Native model", default: true }]); expect(restored.store.getTask(id).nativeModes).toEqual([{ id: "analysis", name: "Analysis", default: true }]); } finally { await restored.close(); }
		} finally { if (!closed) await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it.each([true, false])("only restores input when rejection is confirmed (%s)", async confirmed => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-preflight-"));
		const run = vi.fn().mockRejectedValueOnce(confirmed ? new AgentInputRejectedError("Setup failed") : new Error("Transport disconnected")).mockResolvedValue(undefined);
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "code" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Original instruction" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("failed"));
			const failed = runtime.store.getTask(id); expect(run).toHaveBeenCalledTimes(1);
			if (confirmed) {
				expect(failed.queue).toHaveLength(1); expect(failed.messages).toEqual([]); const original = failed.queue[0];
				await runtime.command({ type: "resume", id }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
				expect(runtime.store.getTask(id).messages).toEqual([expect.objectContaining({ id: original.id, text: original.text })]); expect(run).toHaveBeenCalledTimes(2);
			} else { expect(failed.queue).toEqual([]); expect(failed.messages).toHaveLength(1); }
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("blocks duplicate steering sends and waits for delivery settlement during shutdown", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-steering-close-")); let finish: (() => void) | undefined; let reject: ((error: Error) => void) | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, steer: async () => { await new Promise<void>((_resolve, fail) => { reject = fail; }); }, cancel: async () => { finish?.(); reject?.(new Error("Disconnected")); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(finish).toBeDefined());
			const delivery = runtime.command({ type: "steer", id, text: "Change direction" }); await vi.waitFor(() => expect(reject).toBeDefined());
			await expect(runtime.command({ type: "steer", id, text: "Duplicate" })).rejects.toThrow("Wait for");
			await runtime.close(); expect((await delivery).tasks[0].steeringReviewCount).toBe(1);
			const restored = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
			try { expect(restored.getTask(id).steering?.[0].status).toBe("unconfirmed"); } finally { restored.close(); }
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("persists steering before delivery and retains rejected and uncertain instructions without replay", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-steering-"));
		let finish: (() => void) | undefined;
		const steer = vi.fn();
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); }, steer }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(finish).toBeDefined());
			steer.mockImplementationOnce(async message => { expect(runtime.store.getTask(id).steering?.[0]).toMatchObject({ id: message.id, status: "sending" }); });
			await runtime.command({ type: "steer", id, text: "Change direction" });
			expect(runtime.store.getTask(id).messages.at(-1)).toMatchObject({ text: "Change direction", delivery: "steer" }); expect(runtime.store.getTask(id).steering).toEqual([]);
			steer.mockRejectedValueOnce(new AgentInputRejectedError("Turn finished")); await runtime.command({ type: "steer", id, text: "Rejected" });
			steer.mockRejectedValueOnce(new Error("Transport closed")); await runtime.command({ type: "steer", id, text: "Uncertain" });
			const pending = runtime.store.getTask(id).steering!; expect(pending.map(message => message.status)).toEqual(["rejected", "unconfirmed"]); expect(runtime.store.getTask(id).queue).toEqual([]);
			await runtime.command({ type: "steer-queue", id, messageId: pending[0].id }); expect(runtime.store.getTask(id).queue[0].text).toBe("Rejected");
			await runtime.command({ type: "steer-discard", id, messageId: pending[1].id }); expect(runtime.store.getTask(id).steering).toEqual([]);
			await runtime.command({ type: "cancel", id }); expect(steer).toHaveBeenCalledTimes(3);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("validates typed forms, preserves other requests and removes externally settled forms", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-form-runtime-"));
		let callbacks: AgentCallbacks | undefined; let finish: (() => void) | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, input) => { callbacks = input; await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "opencode", model: "default", mode: "chat" }); const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Start" }); await vi.waitFor(() => expect(callbacks).toBeDefined());
			const approval = callbacks!.onApproval("write", "Review action");
			const answer = callbacks!.onForm!({ id: "native-form", title: "Count", fields: [{ type: "integer", key: "count", required: true, minimum: 1 }] });
			const requestId = runtime.store.getTask(id).forms![0].id;
			await expect(runtime.command({ type: "form-answer", id, requestId, answer: { count: 0 } })).rejects.toThrow("valid integer");
			expect(runtime.store.getTask(id).forms).toHaveLength(1);
			await runtime.command({ type: "form-answer", id, requestId, answer: { count: 3 } }); expect(await answer).toEqual({ count: 3 });
			expect(runtime.store.getTask(id).status).toBe("waiting");
			const controller = new AbortController(); const external = callbacks!.onForm!({ id: "external", title: "External", fields: [{ type: "string", key: "name" }] }, controller.signal);
			controller.abort(); expect(await external).toBeNull(); expect(runtime.store.getTask(id).forms).toEqual([]);
			await runtime.command({ type: "cancel", id }); expect(await approval).toBe("decline");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
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
