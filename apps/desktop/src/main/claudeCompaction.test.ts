import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Task } from "../shared/workspace";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { taskExport } from "./taskExport";
const sdk = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("./nativeProcess", () => ({ resolveNativeCommand: async () => ({ executable: "claude", prefix: [] }) }));
import { ClaudeAdapter } from "./claudeAdapter";
const task: Task = { id: "owned", title: "Owned compaction", harness: "claude", nativeSessionId: "session", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const status = { type: "system", subtype: "status", status: "compacting", uuid: "started", session_id: "session" };
const metadata = { trigger: "manual", pre_tokens: 1234, post_tokens: 234, duration_ms: 80 };
const boundary = { type: "system", subtype: "compact_boundary", compact_metadata: metadata, uuid: "boundary", session_id: "session" };
const success = { type: "result", subtype: "success", is_error: false, result: "Native command result", uuid: "result", session_id: "session" };
const sink = () => ({ onSession: vi.fn(), onDelta: vi.fn(), onActivity: vi.fn(), onApproval: vi.fn(async () => "decline" as const) });
function fixture(messages: Record<string, unknown>[], hold = false) {
	const close = vi.fn(); sdk.query.mockClear();
	sdk.query.mockImplementation(({ options }) => Object.assign((async function* () { for (const message of messages) yield message; if (hold && !options.abortController.signal.aborted) await new Promise<void>(resolve => options.abortController.signal.addEventListener("abort", () => resolve(), { once: true })); })(), { close }));
	return close;
}
describe("Claude native compaction", () => {
	it("normalizes bare manual commands and retains exact boundary metadata", async () => {
		fixture([status, boundary, success]); const callbacks = sink();
		await new ClaudeAdapter().run(task, ".", "  /compact\n", callbacks);
		expect(sdk.query.mock.calls[0][0]).toMatchObject({ prompt: "/compact", options: { resume: "session" } });
		expect(callbacks.onActivity.mock.calls.map(([activity]) => activity)).toEqual([{ id: "compaction:started", title: "Context compaction", type: "compaction", text: "", status: "running" }, { id: "compaction:started", title: "Context compaction", type: "compaction", text: JSON.stringify(metadata, null, 2), status: "completed", compaction: { beforeTokens: 1234, afterTokens: 234, durationMs: 80 } }]); expect(callbacks.onDelta).not.toHaveBeenCalled();
	});
	it.each([
		[{ trigger: "manual", pre_tokens: 12 }, { beforeTokens: 12 }],
		[{ trigger: "manual", pre_tokens: 0, post_tokens: 0, duration_ms: 0 }, { beforeTokens: 0, afterTokens: 0, durationMs: 0 }],
		[{ trigger: "manual", pre_tokens: -1 }, undefined],
		[{ trigger: "manual", pre_tokens: 12, post_tokens: -1, duration_ms: -1 }, { beforeTokens: 12 }],
	])("projects only valid advertised metrics (%j)", async (nativeMetadata, expected) => {
		fixture([{ ...boundary, compact_metadata: nativeMetadata }, success]); const callbacks = sink(); await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity.mock.lastCall?.[0].compaction).toEqual(expected); expect(callbacks.onActivity.mock.lastCall?.[0].text).toBe(JSON.stringify(nativeMetadata, null, 2));
	});
	it("deduplicates boundary/status messages and ignores foreign sessions", async () => {
		fixture([{ ...status, session_id: "foreign" }, status, status, { ...boundary, session_id: "foreign" }, boundary, boundary, success]); const callbacks = sink();
		await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity).toHaveBeenCalledTimes(2); expect(callbacks.onSession.mock.calls.flat()).not.toContain("foreign");
	});
	it("records automatic compaction without changing assistant output", async () => {
		fixture([status, { ...boundary, compact_metadata: { ...metadata, trigger: "auto" } }, { type: "assistant", parent_tool_use_id: null, session_id: "session", message: { id: "answer", content: [{ type: "text", text: "Original answer 世界" }] } }, success]); const callbacks = sink();
		await new ClaudeAdapter().run(task, ".", "Continue", callbacks);
		expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ type: "compaction", title: "Automatic context compaction", status: "completed" }); expect(callbacks.onDelta).toHaveBeenCalledExactlyOnceWith("answer", "Original answer 世界");
	});
	it("does not claim a boundary for a successful no-op command", async () => {
		const result = "Not enough messages to compact. 世界"; fixture([{ ...success, result }]); const callbacks = sink();
		await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity).toHaveBeenCalledExactlyOnceWith({ id: "compaction-result:result", type: "compaction", title: "Compaction result", text: result, status: "completed" }); expect(callbacks.onDelta).not.toHaveBeenCalled();
	});
	it("retains native assistant output when the command result is empty", async () => {
		const reason = "Error: No messages to compact"; fixture([{ type: "assistant", parent_tool_use_id: null, session_id: "session", message: { id: "native-result", content: [{ type: "text", text: reason }] } }, { ...success, result: "" }]); const callbacks = sink(); await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ title: "Compaction result", text: reason }); expect(callbacks.onDelta).toHaveBeenCalledExactlyOnceWith("native-result", reason);
	});
	it("retains native local-command output without making an assistant message", async () => {
		const reason = "Native command explanation 世界"; fixture([{ type: "system", subtype: "local_command_output", content: reason, uuid: "local", session_id: "session" }, { ...success, result: "" }]); const callbacks = sink(); await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ title: "Compaction result", text: reason }); expect(callbacks.onDelta).not.toHaveBeenCalled();
	});
	it("retains explicit lack of confirmation for an empty native result", async () => {
		fixture([{ ...success, result: "" }]); const callbacks = sink(); await new ClaudeAdapter().run(task, ".", "/compact", callbacks);
		expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ title: "Compaction result", text: "The native command finished without confirming a compaction boundary." });
	});
	it("retains native compact failure details without later claiming success", async () => {
		fixture([status, { type: "system", subtype: "status", status: null, compact_result: "failed", compact_error: "Owned provider failure", uuid: "failed", session_id: "session" }, success]); const callbacks = sink();
		await expect(new ClaudeAdapter().run(task, ".", "/compact", callbacks)).rejects.toThrow("Owned provider failure"); expect(callbacks.onActivity).toHaveBeenCalledTimes(2); expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:started", status: "failed", text: "Owned provider failure" });
	});
	it("retains ordinary commands and attached input on their existing path", async () => {
		fixture([success]); const callbacks = sink(); await new ClaudeAdapter().run(task, ".", "Explain /compact", callbacks); expect(sdk.query.mock.calls[0][0].prompt).toBe("Explain /compact"); expect(callbacks.onActivity).not.toHaveBeenCalled();
		fixture([success]); await new ClaudeAdapter().run(task, ".", "/compact", sink(), undefined, [{ id: "file", taskId: "owned", name: "notes.txt", kind: "text", mimeType: "text/plain", size: 5, filePath: "owned.txt", text: "Notes" }]); expect(sdk.query.mock.calls.at(-1)?.[0].prompt).toContain("Notes");
	});
	it.each([false, true])("marks unfinished compaction after stream termination or Stop (%s)", async stop => {
		const close = fixture([status], stop); const callbacks = sink(); const adapter = new ClaudeAdapter(); const run = adapter.run(task, ".", "/compact", callbacks); const rejected = expect(run).rejects.toThrow("before completing");
		if (stop) { await vi.waitFor(() => expect(callbacks.onActivity).toHaveBeenCalled()); await adapter.cancel(); } await rejected;
		expect(close).toHaveBeenCalledOnce(); expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:started", title: "Compaction completion unconfirmed", status: "failed" });
	});
	it("persists confirmed metadata without replacing local history or exports", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-claude-compaction-")); fixture([status, boundary, success]); const runtime = new WorkspaceRuntime(directory, () => new ClaudeAdapter()); let id = "";
		try {
			const state = await runtime.command({ type: "create-task", harness: "claude", model: "default", mode: "chat" }); id = state.tasks[0].id; const original = runtime.store.getTask(id); original.nativeSessionId = "session"; original.messages = [{ id: "old-user", role: "user", text: "Original input", createdAt: original.createdAt }, { id: "old-answer", role: "assistant", text: "Saved answer 世界", createdAt: original.createdAt }]; runtime.store.saveTask(original);
			await runtime.command({ type: "send", id, text: "/compact" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed")); const saved = runtime.store.getTask(id);
			expect(saved.messages.map(message => message.text)).toEqual(["Original input", "Saved answer 世界", "/compact"]); expect(saved.activities?.[0]).toMatchObject({ type: "compaction", status: "completed", text: JSON.stringify(metadata, null, 2) }); expect(saved.activities?.[0].compaction).toEqual({ beforeTokens: 1234, afterTokens: 234, durationMs: 80 }); const exported = JSON.parse(await taskExport(saved, "json", runtime.attachments)); expect(exported.messages.map((message: { text: string }) => message.text)).toEqual(saved.messages.map(message => message.text));
		} finally { await runtime.close(); }
		const reopened = new WorkspaceStore(path.join(directory, "workspace.sqlite")); try { expect(reopened.getTask(id).activities?.[0].text).toBe(JSON.stringify(metadata, null, 2)); expect(reopened.getTask(id).activities?.[0].compaction).toEqual({ beforeTokens: 1234, afterTokens: 234, durationMs: 80 }); } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
