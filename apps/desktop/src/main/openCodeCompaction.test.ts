import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { taskExport } from "./taskExport";
import type { Task } from "../shared/workspace";
import type { AttachmentContent } from "./attachments";
import type * as OpenCodeModule from "@opencode/client";
const sdk = vi.hoisted(() => ({ make: vi.fn() }));
vi.mock("@opencode/client", async importOriginal => ({ ...await importOriginal<typeof OpenCodeModule>(), OpenCode: { make: sdk.make } }));
import { OpenCodeAdapter } from "./openCodeAdapter";

const task: Task = { id: "owned", title: "Owned compaction", harness: "opencode", nativeSessionId: "session", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const callbacks = () => ({ onDelta: vi.fn(), onActivity: vi.fn(), onSession: vi.fn(), onApproval: vi.fn(async () => "decline" as const) });
type Event = { id?: string; type: string; data: Record<string, unknown> };
const started: Event = { id: "start", type: "session.compaction.started", data: { sessionID: "session", reason: "manual" } };
const ended: Event = { id: "end", type: "session.compaction.ended", data: { sessionID: "session", reason: "manual", text: "  Native summary\n<literal> 世界\n" } };
const completed: Event = { type: "session.execution.succeeded", data: { sessionID: "session" } };
function fixture(events: Event[], hold = false) {
	let admit!: () => void;
	const admitted = new Promise<void>(resolve => { admit = resolve; });
	const session = { get: vi.fn(async () => ({ id: "session" })), switchAgent: vi.fn(), update: vi.fn(), form: { list: vi.fn(async () => []) }, wait: vi.fn(async () => {}), prompt: vi.fn<(input: { text: string }) => Promise<void>>(async () => { admit(); }), compact: vi.fn(async () => { admit(); }), interrupt: vi.fn() };
	sdk.make.mockReturnValue({ session, event: { subscribe: async function* (options: { signal: AbortSignal; onActivity: () => void }) {
		options.onActivity(); await admitted;
		for (const event of events) yield event;
		if (hold && !options.signal.aborted) await new Promise<void>(resolve => options.signal.addEventListener("abort", () => resolve(), { once: true }));
	} } });
	return { session, admit, adapter: new OpenCodeAdapter(async () => ({ url: "http://owned.invalid", version: "2.0.22" })) };
}

describe("native OpenCode compaction", () => {
	it("preserves native admission errors without claiming compaction occurred", async () => {
		const { adapter, session, admit } = fixture([]); const sink = callbacks();
		session.compact.mockImplementationOnce(async () => { admit(); throw new Error("Native admission rejected"); });
		await expect(adapter.run(task, ".", "/compact", sink)).rejects.toThrow("Native admission rejected");
		expect(sink.onActivity).not.toHaveBeenCalled();
	});
	it("waits for native settlement after confirmed compaction", async () => {
		let release!: () => void; const idle = new Promise<void>(resolve => { release = resolve; });
		const { adapter, session } = fixture([started, ended, completed]); session.wait.mockImplementationOnce(async () => idle);
		let finished = false; const run = adapter.run(task, ".", "/compact", callbacks()).then(() => { finished = true; });
		await vi.waitFor(() => expect(session.wait).toHaveBeenCalledOnce()); expect(finished).toBe(false);
		release(); await run;
	});
	it("does not reuse an unfinished compaction's identity for a later compaction", async () => {
		const { adapter } = fixture([started, { ...started, id: "next-start", data: { ...started.data, reason: "auto" } }, ended, completed]); const sink = callbacks();
		await adapter.run(task, ".", "Continue", sink);
		expect(sink.onActivity.mock.calls[1][0]).toMatchObject({ id: "compaction:start", status: "failed", title: "Compaction completion unconfirmed" });
		expect(sink.onActivity.mock.calls[3][0]).toMatchObject({ id: "compaction:next-start", status: "completed", text: ended.data.text });
	});
	it("persists native compaction through real orchestration without replacing conversation or export history", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-opencode-compaction-"));
		const { adapter, session } = fixture([started, ended, completed]);
		const runtime = new WorkspaceRuntime(directory, () => adapter);
		let id = "";
		try {
			const state = await runtime.command({ type: "create-task", harness: "opencode", model: "default", mode: "chat" }); id = state.tasks[0].id;
			const original = runtime.store.getTask(id); original.nativeSessionId = "session";
			original.messages = [{ id: "old-user", role: "user", text: "Original input", createdAt: original.createdAt }, { id: "old-answer", role: "assistant", text: "Saved answer 世界", createdAt: original.createdAt }]; runtime.store.saveTask(original);
			await runtime.command({ type: "send", id, text: "/compact" });
			await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
			const saved = runtime.store.getTask(id);
			expect(saved.messages.map(message => message.text)).toEqual(["Original input", "Saved answer 世界", "/compact"]);
			expect(saved.activities).toEqual([expect.objectContaining({ type: "compaction", status: "completed", text: ended.data.text })]);
			const exported = JSON.parse(await taskExport(saved, "json", runtime.attachments));
			expect(exported.messages.map((message: { text: string }) => message.text)).toEqual(saved.messages.map(message => message.text));
			expect(session.prompt).not.toHaveBeenCalled();
		} finally { await runtime.close(); }
		const reopened = new WorkspaceStore(path.join(directory, "workspace.sqlite"));
		try { expect(reopened.getTask(id).activities?.[0]).toMatchObject({ type: "compaction", text: ended.data.text, status: "completed" }); }
		finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("dispatches the native command and preserves the exact confirmed summary", async () => {
		const { adapter, session } = fixture([started, { ...started, data: { ...started.data, sessionID: "foreign" } }, started, ended, ended, completed]);
		const sink = callbacks(); await adapter.run(task, ".", "  /compact\n", sink);
		expect(session.compact).toHaveBeenCalledExactlyOnceWith({ sessionID: "session" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
		expect(session.prompt).not.toHaveBeenCalled(); expect(session.wait).toHaveBeenCalledOnce(); expect(sink.onDelta).not.toHaveBeenCalled();
		expect(sink.onActivity.mock.calls.map(([activity]) => activity)).toEqual([
			{ id: "compaction:start", type: "compaction", title: "Context compaction", text: "", status: "running" },
			{ id: "compaction:start", type: "compaction", title: "Context compaction", text: ended.data.text, status: "completed" },
		]);
	});
	it("keeps text with attachments and other slash text on the ordinary prompt path", async () => {
		const attachment: AttachmentContent = { id: "file", taskId: "owned", name: "notes.txt", kind: "text", mimeType: "text/plain", size: 5, filePath: "owned.txt", text: "Notes" };
		for (const [text, attachments] of [["/compact", [attachment]], ["Explain /compact", []], ["/compact extra", []]] as const) {
			const { adapter, session } = fixture([completed]); await adapter.run(task, ".", text, callbacks(), undefined, [...attachments]);
			expect(session.compact).not.toHaveBeenCalled(); expect(session.prompt).toHaveBeenCalledOnce();
			if (attachments.length) expect(session.prompt.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("Notes") });
		}
	});
	it("records automatic compaction and native failures without inventing assistant output", async () => {
		const error = { type: "ProviderError", message: "Owned provider failure", status: 503 };
		const { adapter } = fixture([{ ...started, data: { ...started.data, reason: "auto" } }, { id: "failure", type: "session.compaction.failed", data: { sessionID: "session", reason: "auto", error } }, { ...ended, id: "later-confirmed" }, completed]);
		const sink = callbacks(); await adapter.run(task, ".", "Continue", sink);
		expect(sink.onActivity.mock.calls[1][0]).toMatchObject({ id: "compaction:start", title: "Automatic context compaction", status: "failed", text: JSON.stringify(error, null, 2) });
		expect(sink.onActivity.mock.calls[2][0]).toMatchObject({ id: "compaction:later-confirmed", status: "completed", text: ended.data.text });
		expect(sink.onDelta).not.toHaveBeenCalled();
	});
	it.each([false, true])("reports unconfirmed completion after disconnect or Stop (%s)", async stop => {
		const { adapter, session } = fixture([started], stop); const sink = callbacks();
		const run = adapter.run(task, ".", "/compact", sink); const rejected = expect(run).rejects.toThrow("disconnected");
		if (stop) { await vi.waitFor(() => expect(sink.onActivity).toHaveBeenCalled()); await adapter.cancel(); }
		await rejected;
		expect(sink.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:start", title: "Compaction completion unconfirmed", status: "failed" });
		if (stop) expect(session.interrupt).toHaveBeenCalledWith({ sessionID: "session" }, expect.anything());
	});
});
