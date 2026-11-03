import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { GlobalInstructions } from "./globalInstructions";
import type { AgentAdapter } from "./agentAdapter";
import type { McpConnection } from "../shared/mcp";
import { defaultPreferences } from "../shared/preferences";
import { isOrchestrationChild } from "../shared/orchestration";

/** Each run blocks until released by task id; cancellation releases it. */
function gated(onRun?: AgentAdapter["run"]) {
	const releases = new Map<string, () => void>(), run = vi.fn<AgentAdapter["run"]>();
	const factory = (): AgentAdapter => { let release: (() => void) | undefined; return { run: async (task, cwd, text, callbacks, ...rest) => { run(task, cwd, text, callbacks, ...rest); if (onRun) return onRun(task, cwd, text, callbacks, ...rest); await new Promise<void>(resolve => { release = resolve; releases.set(task.id, resolve); }); }, cancel: async () => { release?.(); } }; };
	return { factory, run, release: (id: string) => releases.get(id)?.() };
}
async function withRuntime(name: string, factory: ConstructorParameters<typeof WorkspaceRuntime>[1], test: (runtime: WorkspaceRuntime, directory: string) => Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), `phaseo-${name}-`)); const runtime = new WorkspaceRuntime(directory, factory);
	try { await test(runtime, directory); } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
}
const parentOf = async (runtime: WorkspaceRuntime, mode: "chat" | "plan" | "code" = "code", permissionMode?: "supervised" | "full-access") => {
	const before = new Set(runtime.store.getOverview().tasks.map(task => task.id));
	return (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode, permissionMode })).tasks.find(task => !before.has(task.id))!.id;
};

describe("orchestration parity", () => {
	it("delivers children that finish together in one message and wakes the parent once", async () => {
		let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
		const run = vi.fn<AgentAdapter["run"]>(async (task, _cwd, _text, callbacks) => { if (task.delegation) { await gate; callbacks.onDelta("answer", `Findings from ${task.title}`); } else callbacks.onDelta("answer", "Reviewed"); });
		await withRuntime("batch", () => ({ run, cancel: async () => {} }), async runtime => {
			const parentId = await parentOf(runtime), tools = runtime.threadTools(parentId);
			const first = await tools.delegate({ requestId: "a", title: "A", prompt: "A", background: true }), second = await tools.delegate({ requestId: "b", title: "B", prompt: "B", background: true });
			await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2)); release();
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			await new Promise(resolve => setTimeout(resolve, 400));
			expect(run).toHaveBeenCalledTimes(3);
			const delivered = runtime.store.getTask(parentId).messages.filter(message => message.delivery === "subagent");
			expect(delivered).toHaveLength(1); expect(delivered[0].sourceTaskIds?.toSorted()).toEqual([first.id, second.id].toSorted());
			expect(delivered[0].text.match(/^Delegated agent/gm)).toHaveLength(2); expect(delivered[0].text).toContain("Findings from A"); expect(delivered[0].text).toContain("Findings from B");
		});
	});
	it("wakes idle parents at launch for results recorded or queued while closed", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-launch-wake-")); const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		const parent = store.apply({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
		const child = store.createDelegatedTask({ type: "create-task", harness: "codex", model: "owned", mode: "code" }, { parentTaskId: parent.id, requestId: "r", background: true }, "Inspect", "Child");
		const finished = store.getTask(child.id); finished.queue = []; finished.status = "completed"; finished.messages.push({ id: "answer", role: "assistant", text: "Launch findings", createdAt: new Date().toISOString() }); store.saveTask(finished);
		const queued = store.apply({ type: "create-task", harness: "codex", model: "owned", mode: "code" }); queued.queue.push({ id: "merged", sourceTaskId: child.id, text: "Merged result", createdAt: new Date().toISOString() }); store.saveTask(queued);
		store.close();
		const run = vi.fn<AgentAdapter["run"]>(async () => {}); const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
			expect(run.mock.calls.map(([task]) => task.id).toSorted()).toEqual([parent.id, queued.id].toSorted());
			expect(runtime.store.getTask(parent.id).messages).toEqual([expect.objectContaining({ delivery: "subagent", text: expect.stringContaining("Launch findings") })]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("reports children cut off by quitting without waking their parent at launch", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-launch-quiet-")); const store = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		const parent = store.apply({ type: "create-task", harness: "codex", model: "owned", mode: "code" });
		const child = store.createDelegatedTask({ type: "create-task", harness: "codex", model: "owned", mode: "code" }, { parentTaskId: parent.id, requestId: "r", background: true }, "Inspect", "Child");
		const stopped = store.getTask(child.id); stopped.queue = []; stopped.status = "interrupted"; stopped.error = "The application stopped during this task. Resume to continue."; store.saveTask(stopped);
		store.close();
		const run = vi.fn<AgentAdapter["run"]>(async () => {}); const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			await new Promise(resolve => setTimeout(resolve, 400));
			expect(run).not.toHaveBeenCalled();
			expect(runtime.store.getTask(parent.id).queue).toEqual([expect.objectContaining({ sourceTaskIds: [child.id] })]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("stops a chat's whole agent tree when it is stopped or archived, even after its own turn ended", async () => {
		const { factory, run } = gated();
		await withRuntime("stop-tree", factory, async runtime => {
			const stopped = await parentOf(runtime), archived = await parentOf(runtime);
			for (const parentId of [stopped, archived]) {
				const child = await runtime.threadTools(parentId).delegate({ requestId: "c", title: "Child", prompt: "Work", background: true });
				await vi.waitFor(() => expect(run.mock.calls.some(([task]) => task.id === child.id)).toBe(true));
				await runtime.threadTools(child.id).delegate({ requestId: "g", title: "Grandchild", prompt: "Work", background: true });
			}
			const tree = (parentId: string) => runtime.store.getOverview().tasks.filter(task => task.delegation?.parentTaskId === parentId).flatMap(child => [child, ...runtime.store.getOverview().tasks.filter(task => task.delegation?.parentTaskId === child.id)]);
			await vi.waitFor(() => expect([...tree(stopped), ...tree(archived)].every(task => task.status === "running")).toBe(true));
			await runtime.command({ type: "cancel", id: stopped });
			await runtime.command({ type: "update-task", id: archived, archived: true });
			await vi.waitFor(() => expect([...tree(stopped), ...tree(archived)].map(task => task.status)).toEqual(["interrupted", "interrupted", "interrupted", "interrupted"]));
		});
	});
	it("picks the single usable account for account-bound harnesses and explains ambiguity", async () => {
		await withRuntime("account-pick", gated().factory, async runtime => {
			runtime.discoverThreadModels = async () => [{ id: "gateway/model", name: "Model" }];
			const tools = runtime.threadTools(await parentOf(runtime)), request = (requestId: string) => ({ requestId, title: "Gateway", prompt: "Inspect", harness: "phaseo" as const, model: "gateway/model" });
			await expect(tools.delegate(request("none"))).rejects.toThrow("No usable Phaseo account");
			runtime.store.saveAccount({ id: "work", name: "Work", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" });
			runtime.store.saveAccount({ id: "expired", name: "Expired", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1", oauthExpiresAt: new Date(0).toISOString() });
			expect(runtime.store.getTask((await tools.delegate(request("single"))).id).accountId).toBe("work");
			runtime.store.saveAccount({ id: "home", name: "Home", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" });
			await expect(tools.delegate(request("several"))).rejects.toThrow(/Several Phaseo accounts.*work \(Work\).*home \(Home\)/);
			expect(runtime.store.getTask((await tools.delegate({ ...request("explicit"), accountId: "home" })).id).accountId).toBe("home");
		});
	});
	it("has no depth or per-parent limit but enforces the workspace limit from preferences", async () => {
		await withRuntime("limits", gated().factory, async runtime => {
			runtime.store.savePreferences({ ...defaultPreferences, maxActiveAgents: 8 });
			const parentId = await parentOf(runtime), tools = runtime.threadTools(parentId);
			for (let index = 0; index < 3; index++) await runtime.command({ type: "fork", id: parentId });
			const children = []; for (let index = 0; index < 5; index++) children.push(await tools.delegate({ requestId: `child-${index}`, title: `Child ${index}`, prompt: "Work" }));
			let owner = children[0].id; for (let depth = 0; depth < 3; depth++) owner = (await runtime.threadTools(owner).delegate({ requestId: `depth-${depth}`, title: "Nested", prompt: "Work" })).id;
			expect(runtime.store.activeAgentCount()).toBe(8);
			await expect(tools.delegate({ requestId: "over", title: "Over", prompt: "Work" })).rejects.toThrow("Settings → General");
			await expect(tools.fork!(parentId, "over-fork")).rejects.toThrow("8 of 8");
			await expect(runtime.threadTools(owner).delegate({ requestId: "deep-over", title: "Over", prompt: "Work" })).rejects.toThrow("Agents running at once");
		});
	});
	it("never gives a child, fork or handoff broader mode or permissions than its parent", async () => {
		await withRuntime("ceiling", gated(async () => {}).factory, async runtime => {
			const other = await parentOf(runtime, "code", "full-access");
			const parentId = await parentOf(runtime, "plan", "supervised"), tools = runtime.threadTools(parentId);
			await expect(tools.delegate({ requestId: "code", title: "Code", prompt: "Edit", mode: "code" })).rejects.toThrow("cannot use code mode");
			await expect(tools.delegate({ requestId: "full", title: "Full", prompt: "Edit", permissionMode: "full-access" })).rejects.toThrow("broader permissions");
			expect(runtime.store.getTask((await tools.delegate({ requestId: "inherit", title: "Inherit", prompt: "Read" })).id)).toMatchObject({ mode: "plan", permissionMode: "supervised" });
			expect(runtime.store.getTask((await tools.delegate({ requestId: "narrow", title: "Narrow", prompt: "Talk", mode: "chat" })).id).mode).toBe("chat");
			await runtime.command({ type: "send", id: parentId, text: "Use this chat", threadReferences: [other] });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			expect(runtime.store.getTask((await tools.fork!(other, "fork")).id)).toMatchObject({ mode: "plan", permissionMode: "supervised" });
			expect(runtime.store.getTask((await tools.handoff!(other, { requestId: "handoff", harness: "claude", model: "target" })).id)).toMatchObject({ mode: "plan", permissionMode: "supervised" });
			const chatParent = await parentOf(runtime, "chat");
			expect(runtime.store.getTask((await runtime.threadTools(chatParent).delegate({ requestId: "chat", title: "Chat", prompt: "Talk" })).id).mode).toBe("chat");
			await expect(runtime.threadTools(chatParent).delegate({ requestId: "plan", title: "Plan", prompt: "Read", mode: "plan" })).rejects.toThrow("cannot use plan mode");
		});
	});
	it("keeps user branches out of orchestration children while recording lineage", async () => {
		await withRuntime("lineage", gated().factory, async runtime => {
			const parentId = await parentOf(runtime);
			const fork = runtime.store.getTask((await runtime.command({ type: "fork", id: parentId })).tasks.find(task => task.id !== parentId)!.id);
			const child = runtime.store.getTask((await runtime.threadTools(parentId).delegate({ requestId: "child", title: "Child", prompt: "Work" })).id);
			expect(fork.parentId).toBe(parentId); expect(isOrchestrationChild(fork)).toBe(false);
			expect(child.parentId).toBe(parentId); expect(isOrchestrationChild(child)).toBe(true);
			expect(runtime.threadTools(parentId).list().map(task => task.id).toSorted()).toEqual([parentId, child.id].toSorted());
			expect(runtime.store.activeAgentCount()).toBe(1);
		});
	});
	it("delivers a foreground child's result after an abandoned wait", async () => {
		const { factory, run, release } = gated();
		await withRuntime("wait-upgrade", factory, async runtime => {
			const parentId = await parentOf(runtime), tools = runtime.threadTools(parentId);
			const timedOut = await tools.delegate({ requestId: "timeout", title: "Timeout", prompt: "Work" });
			await vi.waitFor(() => expect(runtime.store.getTask(timedOut.id).status).toBe("running"));
			expect(await tools.wait(timedOut.id, 0)).toMatchObject({ timedOut: true, deliveryQueued: true, thread: { status: "running" } });
			const abandoned = await tools.delegate({ requestId: "abort", title: "Abort", prompt: "Work" }), controller = new AbortController();
			await vi.waitFor(() => expect(runtime.store.getTask(abandoned.id).status).toBe("running"));
			const waiting = tools.wait(abandoned.id, 3600000, controller.signal); controller.abort();
			expect(await waiting).toMatchObject({ timedOut: true, deliveryQueued: true });
			await expect(tools.wait(abandoned.id, 3600001)).rejects.toThrow("Invalid wait timeout");
			release(timedOut.id); release(abandoned.id);
			await vi.waitFor(() => expect(run.mock.calls.some(([task]) => task.id === parentId)).toBe(true));
			expect(runtime.store.getTask(parentId).messages.find(message => message.delivery === "subagent")?.sourceTaskIds?.toSorted()).toEqual([timedOut.id, abandoned.id].toSorted());
		});
	});
	it("delivers a foreground child's result when the parent's turn ends without waiting", async () => {
		let childId = "", finishChild: (() => void) | undefined;
		const turn = gated(async (task, _cwd, _text, callbacks) => { if (task.delegation) await new Promise<void>(resolve => { finishChild = resolve; }); else if (!childId) childId = (await callbacks.threads!.delegate({ requestId: "turn", title: "Turn", prompt: "Work" })).id; });
		await withRuntime("turn-upgrade", turn.factory, async runtime => {
			const parentId = await parentOf(runtime);
			await runtime.command({ type: "send", id: parentId, text: "Delegate without waiting" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			await vi.waitFor(() => expect(finishChild).toBeDefined()); finishChild!();
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).messages.filter(message => message.delivery === "subagent")).toHaveLength(1));
			expect(runtime.store.getTask(childId).delegation?.background).toBeUndefined();
		});
	});
	it("labels each approval-gated orchestration call and gives Chat only the orchestration server", async () => {
		let connections: McpConnection[] = [];
		await withRuntime("labels", (_harness, _agent, _openCode, value) => ({ run: async task => {
			connections = value ?? [];
			if (task.mode !== "code") return;
			const connection = connections.find(server => server.orchestration)!; if (connection.transport !== "http") throw new Error("Expected HTTP");
			const client = new Client({ name: "labels", version: "1" });
			try { await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: connection.headers } })); await client.callTool({ name: "rename_thread", arguments: { id: task.title, title: "Renamed" } }); } finally { await client.close(); }
		}, cancel: async () => {} }), async runtime => {
			const chat = await parentOf(runtime, "chat");
			await runtime.command({ type: "send", id: chat, text: "Hello" });
			await vi.waitFor(() => expect(runtime.store.getTask(chat).status).toBe("completed"));
			expect(connections.filter(server => server.orchestration)).toHaveLength(1);
			const parentId = await parentOf(runtime);
			const child = await runtime.threadTools(parentId).fork!(parentId, "child");
			await runtime.command({ type: "update-task", id: parentId, title: child.id });
			await runtime.command({ type: "send", id: parentId, text: "Rename" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).approvals).toHaveLength(1));
			expect(runtime.store.getTask(parentId).approvals![0].method).toBe("Rename agent chat");
			await runtime.command({ type: "approval", id: parentId, approvalId: runtime.store.getTask(parentId).approvals![0].id, decision: "decline" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
		});
	});
	it("asks the person before an agent changes the instructions for every chat, even with full access", async () => {
		let result: unknown;
		await withRuntime("instructions", (_harness, _agent, _openCode, connections = []) => ({ run: async () => {
			const client = new Client({ name: "instructions", version: "1" }), connection = connections.find(server => server.orchestration)!; if (connection.transport !== "http") throw new Error("Expected HTTP");
			try { await client.connect(new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: connection.headers } })); result = await client.callTool({ name: "update_global_instructions", arguments: { content: "Answer in French.", expectedHash: "new" } }); } finally { await client.close(); }
		}, cancel: async () => {} }), async (runtime, directory) => {
			runtime.globalInstructions = new GlobalInstructions(path.join(directory, "instructions"));
			const parentId = await parentOf(runtime, "code", "full-access");
			await runtime.command({ type: "send", id: parentId, text: "Change my instructions" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).approvals).toHaveLength(1));
			expect(runtime.store.getTask(parentId).approvals![0].method).toBe("Change instructions for every chat");
			await runtime.command({ type: "approval", id: parentId, approvalId: runtime.store.getTask(parentId).approvals![0].id, decision: "accept" });
			await vi.waitFor(() => expect(runtime.store.getTask(parentId).status).toBe("completed"));
			expect(JSON.stringify(result)).toContain("Answer in French.");
			expect((await runtime.globalInstructions.read()).content).toBe("Answer in French.");
		});
	});
	it("lists usable harnesses with accounts and models in one bounded call", async () => {
		await withRuntime("agents", gated().factory, async runtime => {
			const options = [{ id: "effort", label: "Effort", type: "select" as const, options: Array.from({ length: 30 }, (_, index) => ({ id: `level-${index}`, label: `Level ${index}`, description: "x".repeat(50) })) }];
			const discover = vi.fn(async (harness: string) => harness === "codex" ? [{ id: "old", name: "Old", legacy: true }, ...Array.from({ length: 500 }, (_, index) => ({ id: `codex-${index}`, name: `Codex ${index}`, options }))] : [{ id: `${harness}-model`, name: "Model" }]);
			runtime.discoverThreadModels = discover;
			runtime.discoverInstallations = async () => [{ harness: "claude", installed: false, error: "Claude Code is not installed." }, { harness: "codex", installed: true }];
			runtime.store.saveAccount({ id: "gateway", name: "Gateway", harness: "phaseo", kind: "api", configured: true, endpoint: "http://127.0.0.1:1/v1" });
			const tools = runtime.threadTools(await parentOf(runtime));
			const catalog = await tools.agents!();
			expect(JSON.stringify(catalog).length).toBeLessThanOrEqual(60000); expect(catalog.truncated).toBe(true);
			expect(catalog.unavailable).toEqual(expect.arrayContaining([{ harness: "claude", reason: "Claude Code is not installed." }, { harness: "cursor", reason: "No usable account is connected." }]));
			const codex = catalog.harnesses.find(entry => entry.harness === "codex")!.accounts[0];
			expect(codex).toMatchObject({ name: "Default sign-in", total: 501 }); expect(codex.models[0].id).toBe("codex-0"); expect(codex.models.some(model => model.legacy)).toBe(false);
			expect(catalog.harnesses.find(entry => entry.harness === "phaseo")).toEqual({ harness: "phaseo", accountRequired: true, accounts: [{ id: "gateway", name: "Gateway", total: 1, models: [{ id: "phaseo-model", name: "Model" }] }] });
			expect(catalog.limits).toEqual({ activeAgents: 0, maxActiveAgents: 32 });
			const calls = discover.mock.calls.length;
			expect((await tools.agents!({ harness: "codex", query: "old" })).harnesses[0].accounts[0].models).toEqual([{ id: "old", name: "Old", legacy: true }]);
			expect(discover).toHaveBeenCalledTimes(calls);
			const chatCatalog = await runtime.threadTools(await parentOf(runtime, "chat")).agents!({ harness: "grok" });
			expect(chatCatalog.unavailable[0].reason).toContain("Code and Plan");
		});
	});
});
