import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import type { AgentAdapter, AgentCallbacks } from "./agentAdapter";
import { validateDelegate } from "./threadTools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

describe("scoped desktop orchestration", () => {
	it("persists native lifecycle updates as one read-only observation", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-native-observation-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, callbacks) => {
			callbacks.onActivity?.({ id: "native-agent:child", type: "tool", title: "Review", text: "", status: "running", nativeAgent: { id: "child", status: "running" } });
			callbacks.onActivity?.({ id: "native-agent:child", type: "tool", title: "Review", text: "Findings", status: "completed", nativeAgent: { id: "child", status: "completed" } });
		}, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const id = state.tasks[0].id; await runtime.command({ type: "send", id, text: "Inspect" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			const activities = runtime.store.getTaskView(id).activities!.filter(activity => activity.nativeAgent);
			expect(activities).toHaveLength(1);
			expect(activities[0]).toMatchObject({ text: "Findings", nativeAgent: { id: "child", status: "completed" } });
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("hands off portable context once with inherited permissions and a fresh session", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-owned-handoff-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => {}, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "source", mode: "code", permissionMode: "supervised" });
			const source = runtime.store.getTask(state.tasks[0].id);
			source.nativeSessionId = "private-native-session";
			source.messages.push({ id: "context", role: "assistant", text: "Existing findings", createdAt: new Date().toISOString() }); runtime.store.saveTask(source);
			const tools = runtime.threadTools(source.id);
			const target = { requestId: "handoff", harness: "claude" as const, model: "target" };
			const child = await tools.handoff!(source.id, target);
			expect((await tools.handoff!(source.id, target)).id).toBe(child.id);
			const stored = runtime.store.getTask(child.id);
			expect(stored.nativeSessionId).toBeUndefined();
			expect(stored.permissionMode).toBe("supervised");
			expect(stored.handoffFrom).toBe("codex");
			expect(stored.messages.at(-1)?.text).toBe("Existing findings");
			expect(stored.delegation?.kind).toBe("handoff");
			source.status = "running"; runtime.store.saveTask(source);
			await expect(tools.handoff!(source.id, { ...target, requestId: "active" })).rejects.toThrow("Stop");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("steers an active owned child through the shared provider runtime", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-child-steering-"));
		let finish!: () => void;
		const pending = new Promise<void>(resolve => { finish = resolve; });
		const steer = vi.fn(async () => {});
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => pending, steer, cancel: async () => { finish(); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const tools = runtime.threadTools(state.tasks[0].id);
			const child = await tools.delegate({ requestId: "steer", title: "Review", prompt: "Inspect" });
			await vi.waitFor(() => expect(runtime.store.getTask(child.id).status).toBe("running"));
			await tools.steer!(child.id, "Focus on tests");
			expect(steer).toHaveBeenCalledWith(expect.objectContaining({ text: "Focus on tests" }), []);
			expect(runtime.store.getTask(child.id).messages).toEqual(expect.arrayContaining([expect.objectContaining({ delivery: "steer", text: "Focus on tests" })]));
		} finally { finish(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("manages owned child titles and queues without granting access to other chats", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-child-controls-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => {}, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const parentId = state.tasks[0].id, tools = runtime.threadTools(parentId);
			const child = await tools.fork!(parentId, "controls");
			expect((await tools.rename!(child.id, "Review")).title).toBe("Review");
			const stored = runtime.store.getTask(child.id);
			stored.queue.push({ id: "queued", text: "First", createdAt: new Date().toISOString() });
			runtime.store.saveTask(stored);
			expect(tools.queue!(child.id)[0].text).toBe("First");
			await tools.editQueue!(child.id, "queued", "Updated");
			expect(tools.queue!(child.id)[0].text).toBe("Updated");
			await tools.editQueue!(child.id, "queued");
			expect(tools.queue!(child.id)).toEqual([]);
			await expect(tools.editQueue!(child.id, "missing", "Test")).rejects.toThrow("not found");
			await expect(tools.rename!(parentId, "Denied")).rejects.toThrow("outside");
			await expect(tools.steer!(parentId, "Denied")).rejects.toThrow("outside");
			expect(() => tools.queue!(parentId)).toThrow("outside");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("forks at a boundary with inherited permissions and merges results once", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-context-transfer-"));
		const run = vi.fn<AgentAdapter["run"]>(async (task, _cwd, _text, callbacks) => callbacks.onDelta("answer", task.delegation ? "Fork findings" : "Merged findings"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code", permissionMode: "supervised" });
			const parentId = state.tasks[0].id, parent = runtime.store.getTask(parentId);
			parent.messages = [{ id: "boundary", role: "user", text: "Earlier context", createdAt: new Date().toISOString() }, { id: "later", role: "assistant", text: "Later context", createdAt: new Date().toISOString() }]; parent.nativeSessionId = "native-parent"; runtime.store.saveTask(parent);
			const service = runtime.threadTools(parentId);
			const fork = await service.fork!(parentId, "owned-fork", "boundary");
			expect((await service.fork!(parentId, "owned-fork", "boundary")).id).toBe(fork.id);
			expect(runtime.store.getTask(fork.id)).toMatchObject({ permissionMode: "supervised", messages: [{ text: "Earlier context" }], delegation: { kind: "fork", sourceMessageId: "boundary" } });
			await service.send!(fork.id, "Inspect the earlier context");
			await service.wait(fork.id, 1000);
			await service.merge!(fork.id, "owned-merge");
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			await service.merge!(fork.id, "owned-merge");
			expect(run).toHaveBeenCalledTimes(2);
			expect(runtime.store.getTask(parentId).messages.filter(message => message.delivery === "subagent")).toHaveLength(1);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("connects native MCP delegation to the runtime permission gate and child execution", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-native-delegate-"));
		const runtime = new WorkspaceRuntime(directory, (_harness, _agent, _openCode, connections) => ({
			run: async (task, _cwd, _text, callbacks) => {
				if (task.delegation) { callbacks.onDelta("result", "Native child findings"); return; }
				const connection = connections!.find(connection => connection.name === "Phaseo orchestration")!;
				if (connection.transport !== "http") throw new Error("Missing native MCP connection");
				const client = new Client({ name: "owned-native", version: "1" });
				try {
					await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: connection.headers } }));
					const response = await client.callTool({ name: "delegate_task", arguments: { requestId: "native", title: "Native child", prompt: "Inspect", harness: "opencode", model: "owned-child" } });
					if (response.isError) throw new Error(JSON.stringify(response));
					const child = JSON.parse((response.content as { text: string }[])[0].text);
					const result = await client.callTool({ name: "wait_thread", arguments: { id: child.id, timeoutMs: 1000 } });
					callbacks.onDelta("answer", (result.content as { text: string }[])[0].text);
				} finally { await client.close(); }
			}, cancel: async () => {},
		}));
		runtime.discoverThreadModels = async () => [{ id: "owned-child", name: "Owned child" }];
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned-parent", mode: "code" });
			const id = state.tasks[0].id;
			await runtime.command({ type: "send", id, text: "Delegate inspection" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).approvals).toHaveLength(1));
			await runtime.command({ type: "approval", id, approvalId: runtime.store.getTask(id).approvals![0].id, decision: "accept" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			expect(runtime.store.getTask(id).messages.at(-1)?.text).toContain("Native child findings");
			expect(runtime.store.getMcpConnections()).toEqual([]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("wakes a parent once for background work and keeps delivery durable", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-background-child-"));
		const run = vi.fn<AgentAdapter["run"]>(async (task, _cwd, _text, callbacks) => { callbacks.onDelta("answer", task.delegation ? "Background findings" : "Reviewed findings"); });
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const parentId = state.tasks[0].id;
			const child = await runtime.threadTools(parentId).delegate({ requestId: "background", title: "Research", prompt: "Inspect", background: true });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			expect(run).toHaveBeenCalledTimes(2);
			expect(runtime.store.getTask(parentId).messages).toEqual(expect.arrayContaining([expect.objectContaining({ delivery: "subagent", text: expect.stringContaining("Background findings") })]));
			expect(runtime.store.collectDelegationResults()).toEqual([]);
			await runtime.threadTools(parentId).delegate({ requestId: "background", title: "Research", prompt: "Inspect", background: true });
			expect(run).toHaveBeenCalledTimes(2);
			expect(runtime.store.getTask(child.id).status).toBe("completed");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("allows explicitly referenced context without granting mutation rights", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-thread-reference-"));
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async () => {}, cancel: async () => {} }));
		try {
			const first = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "chat" });
			const referencedId = first.tasks[0].id;
			const second = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "chat" });
			const parentId = second.tasks.find(task => task.id !== referencedId)!.id;
			expect(() => runtime.threadTools(parentId).read(referencedId)).toThrow("outside");
			await runtime.command({ type: "send", id: parentId, text: "Review this chat", threadReferences: [referencedId] });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			expect(runtime.threadTools(parentId).read(referencedId).thread.id).toBe(referencedId);
			await expect(runtime.threadTools(parentId).interrupt(referencedId)).rejects.toThrow("outside");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("runs isolated children on another harness, deduplicates retries and returns their result", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-delegate-"));
		const run = vi.fn<AgentAdapter["run"]>(async (task, _cwd, text, callbacks) => { expect(text).not.toContain("private parent history"); expect(task.permissionMode).toBe("supervised"); callbacks.onDelta("answer", "Child result"); });
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned-parent", mode: "code", permissionMode: "supervised" });
			const parentId = state.tasks[0].id, parent = runtime.store.getTask(parentId);
			parent.messages.push({ id: "private", role: "user", text: "private parent history", createdAt: new Date().toISOString() }); runtime.store.saveTask(parent);
			const service = runtime.threadTools(parentId);
			const request = { requestId: "owned-retry", title: "Research", prompt: "Inspect only", harness: "opencode" as const, model: "owned-child" };
			const child = await service.delegate(request);
			expect((await service.delegate(request)).id).toBe(child.id);
			const result = await service.wait(child.id, 1000);
			expect(result).toMatchObject({ timedOut: false, thread: { status: "completed", harness: "opencode", model: "owned-child" }, result: "Child result" });
			expect(run).toHaveBeenCalledOnce();
			expect(service.list()).toHaveLength(2);
			expect(runtime.store.getOverview().tasks.find(task => task.id === child.id)?.delegation).toMatchObject({ parentTaskId: parentId, requestId: "owned-retry" });
			const unrelated = await runtime.command({ type: "create-task", harness: "codex", model: "other", mode: "chat" });
			const otherId = unrelated.tasks.find(task => task.id !== parentId && task.id !== child.id)!.id;
			expect(() => service.read(otherId)).toThrow("outside");
			await expect(service.interrupt(parentId)).rejects.toThrow("outside");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("times out without cancelling, propagates parent cancellation and releases pending waits", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-wait-"));
		let finish: (() => void) | undefined, callbacks: AgentCallbacks | undefined;
		const runtime = new WorkspaceRuntime(directory, () => ({ run: async (_task, _cwd, _text, value) => { callbacks = value; await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const parentId = state.tasks[0].id, service = runtime.threadTools(parentId);
			const child = await service.delegate({ requestId: "wait", title: "Wait", prompt: "Wait" });
			await vi.waitFor(() => expect(callbacks).toBeDefined());
			expect(await service.wait(child.id, 0)).toMatchObject({ timedOut: true, thread: { status: "running" } });
			const waiting = service.wait(child.id);
			await runtime.command({ type: "cancel", id: parentId });
			await waiting;
			expect(runtime.store.getTask(child.id).status).toBe("interrupted");
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("retains lineage after restart and does not silently relaunch duplicate work", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-recover-child-"));
		let finish: (() => void) | undefined;
		let runtime = new WorkspaceRuntime(directory, () => ({ run: async () => { await new Promise<void>(resolve => { finish = resolve; }); }, cancel: async () => { finish?.(); } }));
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
			const parentId = state.tasks[0].id;
			const request = { requestId: "durable", title: "Durable", prompt: "Inspect" };
			const child = await runtime.threadTools(parentId).delegate(request);
			await vi.waitFor(() => expect(finish).toBeDefined()); await runtime.close();
			const run = vi.fn(async () => {}); runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
			expect((await runtime.threadTools(parentId).delegate(request)).id).toBe(child.id);
			expect(await runtime.threadTools(parentId).wait(child.id, 0)).toMatchObject({ thread: { status: "interrupted" } });
			expect(run).not.toHaveBeenCalled();
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("validates arguments independently of model JSON schema compliance", () => {
		expect(() => validateDelegate({ requestId: "r", prompt: "p", title: "t", harness: "unknown" })).toThrow("Unknown harness");
		expect(() => validateDelegate({ requestId: "r", prompt: "", title: "t" })).toThrow("prompt");
	});
});
