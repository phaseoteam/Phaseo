import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
import type { AttachmentContent } from "./attachments";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { taskExport } from "./taskExport";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { CodexAdapter } from "./codexAdapter";
import { AgentInputRejectedError } from "./agentAdapter";

type Packet = { id: number; method: string; params: Record<string, unknown> };
type Send = (value: unknown) => void;
const task: Task = { id: "owned", title: "Owned compaction", harness: "codex", nativeSessionId: "native", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const callbacks = () => ({ onDelta: vi.fn(), onActivity: vi.fn(), onSession: vi.fn(), onApproval: vi.fn(async () => "decline" as const) });
function fixture(operation: (packet: Packet, send: Send) => void) {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
	const packets: Packet[] = []; let buffer = "";
	const send: Send = value => { child.stdout.write(JSON.stringify(value) + "\n"); };
	child.stdin.on("data", chunk => {
		buffer += chunk.toString(); let index: number;
		while ((index = buffer.indexOf("\n")) >= 0) {
			const packet = JSON.parse(buffer.slice(0, index)) as Packet; buffer = buffer.slice(index + 1); packets.push(packet);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (["thread/start", "thread/resume", "thread/fork"].includes(packet.method)) send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/interrupt") send({ id: packet.id, result: {} });
			if (packet.method === "thread/compact/start" || packet.method === "turn/start") operation(packet, send);
		}
	});
	native.spawn.mockResolvedValue(child); return { child, packets, send };
}
function start(send: Send) { send({ method: "turn/started", params: { threadId: "native", turn: { id: "turn", status: "inProgress" } } }); }
function item(send: Send, method: string, id = "compact", turnId = "turn", threadId = "native") { send({ method, params: { threadId, turnId, item: { id, type: "contextCompaction" } } }); }
function finish(send: Send, status = "completed", id = "turn", message?: string) { send({ method: "turn/completed", params: { threadId: "native", turn: { id, status, ...(message ? { error: { message } } : {}) } } }); }

describe("native OpenAI compaction", () => {
	it("dispatches compaction without ordinary input and waits for the native turn", async () => {
		let completeItem!: () => void; let completeTurn!: () => void;
		const { packets } = fixture((packet, send) => { send({ id: packet.id, result: {} }); start(send); item(send, "item/started"); completeItem = () => item(send, "item/completed"); completeTurn = () => finish(send); });
		const sink = callbacks(); let done = false; const run = new CodexAdapter().run(task, ".", "  /compact\n", sink).then(() => { done = true; });
		await vi.waitFor(() => expect(sink.onActivity).toHaveBeenCalledOnce()); expect(done).toBe(false);
		completeItem(); await vi.waitFor(() => expect(sink.onActivity).toHaveBeenCalledTimes(2)); expect(done).toBe(false);
		completeTurn(); await run;
		expect(packets.find(packet => packet.method === "thread/compact/start")?.params).toEqual({ threadId: "native" });
		expect(packets.some(packet => packet.method === "turn/start")).toBe(false); expect(sink.onDelta).not.toHaveBeenCalled();
		expect(sink.onActivity.mock.calls.map(([activity]) => activity)).toEqual([{ id: "compact", type: "compaction", title: "Context compaction", text: "", status: "running" }, { id: "compact", type: "compaction", title: "Context compaction", text: "", status: "completed" }]);
	});
	it("requires request acknowledgement even when completion notifications arrive first", async () => {
		let acknowledge!: () => void;
		fixture((packet, send) => { start(send); item(send, "item/started"); item(send, "item/completed"); finish(send); acknowledge = () => send({ id: packet.id, result: {} }); });
		let done = false; const sink = callbacks(); const run = new CodexAdapter().run(task, ".", "/compact", sink).then(() => { done = true; });
		await vi.waitFor(() => expect(sink.onActivity).toHaveBeenCalledTimes(2)); expect(done).toBe(false); acknowledge(); await run;
	});
	it("does not impose turn reasoning options on the compaction endpoint", async () => {
		const { packets } = fixture((packet, send) => { send({ id: packet.id, result: {} }); start(send); item(send, "item/started"); item(send, "item/completed"); finish(send); });
		await new CodexAdapter().run({ ...task, reasoningEffort: "previous-model-option" }, ".", "/compact", callbacks()); expect(packets.some(packet => packet.method === "model/list")).toBe(false);
	});
	it("rejects native admission errors without fabricating compaction", async () => {
		fixture((packet, send) => send({ id: packet.id, error: { code: -32602, message: "Native compact rejected" } })); const sink = callbacks();
		await expect(new CodexAdapter().run(task, ".", "/compact", sink)).rejects.toBeInstanceOf(AgentInputRejectedError); expect(sink.onActivity).not.toHaveBeenCalled();
	});
	it("ignores foreign threads, stale turns, duplicate and late lifecycle events", async () => {
		fixture((packet, send) => { send({ id: packet.id, result: {} }); finish(send, "completed", "old"); item(send, "item/completed", "old-item", "old"); start(send); item(send, "item/started", "foreign", "turn", "other"); item(send, "item/started", "stale", "old"); item(send, "item/started"); item(send, "item/started"); finish(send, "completed", "old"); item(send, "item/completed"); item(send, "item/completed"); item(send, "item/started"); finish(send); });
		const sink = callbacks(); await new CodexAdapter().run(task, ".", "/compact", sink);
		expect(sink.onActivity.mock.calls.map(([activity]) => activity.status)).toEqual(["running", "completed"]);
	});
	it("projects automatic compaction during an ordinary turn without replacing assistant output", async () => {
		fixture((packet, send) => { send({ id: packet.id, result: { turn: { id: "turn" } } }); start(send); item(send, "item/started"); item(send, "item/completed"); send({ method: "item/agentMessage/delta", params: { threadId: "native", turnId: "turn", itemId: "answer", delta: "Original answer 世界" } }); finish(send); });
		const sink = callbacks(); await new CodexAdapter().run(task, ".", "Continue", sink);
		expect(sink.onDelta).toHaveBeenCalledExactlyOnceWith("answer", "Original answer 世界"); expect(sink.onActivity.mock.lastCall?.[0]).toMatchObject({ type: "compaction", text: "", status: "completed" });
	});
	it.each(["/compact with instructions", "Explain /compact", "/compact"])("retains ordinary prompt behavior for other text or attachments (%s)", async text => {
		const attachments: AttachmentContent[] = text === "/compact" ? [{ id: "file", taskId: "owned", name: "notes.txt", kind: "text", mimeType: "text/plain", size: 5, filePath: "owned.txt", text: "Notes" }] : [];
		const { packets } = fixture((packet, send) => { send({ id: packet.id, result: { turn: { id: "turn" } } }); start(send); finish(send); });
		await new CodexAdapter().run(task, ".", text, callbacks(), undefined, attachments);
		expect(packets.some(packet => packet.method === "thread/compact/start")).toBe(false); const prompt = packets.find(packet => packet.method === "turn/start"); expect(prompt).toBeDefined(); if (attachments.length) expect(JSON.stringify(prompt?.params.input)).toContain("Notes");
	});
	it("retains native failure details when compaction completion is unconfirmed", async () => {
		fixture((packet, send) => { send({ id: packet.id, result: {} }); start(send); item(send, "item/started"); finish(send, "failed", "turn", "Owned provider failure"); }); const sink = callbacks();
		await expect(new CodexAdapter().run(task, ".", "/compact", sink)).rejects.toThrow("Owned provider failure"); expect(sink.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compact", type: "compaction", text: "Owned provider failure", status: "failed" });
	});
	it.each([false, true])("marks unfinished compaction on disconnect or Stop and rejects steering (%s)", async stop => {
		const { child, packets } = fixture((packet, send) => { send({ id: packet.id, result: {} }); start(send); item(send, "item/started"); }); const sink = callbacks(); const adapter = new CodexAdapter();
		const run = adapter.run(task, ".", "/compact", sink); const rejected = expect(run).rejects.toThrow(stop ? "Task stopped" : "connection closed");
		await vi.waitFor(() => expect(sink.onActivity).toHaveBeenCalledOnce()); await expect(adapter.steer({ id: "queued", text: "Continue", createdAt: "" }, [])).rejects.toBeInstanceOf(AgentInputRejectedError);
		if (stop) await adapter.cancel(); else child.stdout.end(); await rejected;
		expect(sink.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compact", title: "Compaction completion unconfirmed", status: "failed" }); expect(packets.some(packet => packet.method === "turn/steer")).toBe(false);
		if (stop) expect(packets.find(packet => packet.method === "turn/interrupt")?.params).toEqual({ threadId: "native", turnId: "turn" });
	});
	it("preserves durable messages and conversation exports across compaction", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-native-compaction-"));
		fixture((packet, send) => { send({ id: packet.id, result: {} }); start(send); item(send, "item/started"); item(send, "item/completed"); finish(send); });
		const runtime = new WorkspaceRuntime(directory, () => new CodexAdapter()); let id = "";
		try {
			const state = await runtime.command({ type: "create-task", harness: "codex", model: "default", mode: "chat" }); id = state.tasks[0].id;
			const original = runtime.store.getTask(id); original.nativeSessionId = "native"; original.messages = [{ id: "old-input", role: "user", text: "Original input", createdAt: original.createdAt }, { id: "old-answer", role: "assistant", text: "Saved answer 世界", createdAt: original.createdAt }]; runtime.store.saveTask(original);
			await runtime.command({ type: "send", id, text: "/compact" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			const saved = runtime.store.getTask(id); expect(saved.messages.map(message => message.text)).toEqual(["Original input", "Saved answer 世界", "/compact"]); expect(saved.activities).toEqual([expect.objectContaining({ type: "compaction", status: "completed", text: "" })]);
			const exported = JSON.parse(await taskExport(saved, "json", runtime.attachments)); expect(exported.messages.map((message: { text: string }) => message.text)).toEqual(saved.messages.map(message => message.text));
		} finally { await runtime.close(); }
		const reopened = new WorkspaceStore(path.join(directory, "workspace.sqlite")); try { expect(reopened.getTask(id).activities?.[0]).toMatchObject({ type: "compaction", status: "completed", text: "" }); } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
