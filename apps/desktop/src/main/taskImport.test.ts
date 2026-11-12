import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseConversation, readConversation } from "./taskImport";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { taskExport } from "./taskExport";

const snapshot = { format: "phaseo-conversation", version: 1, title: "Imported research", harness: "codex", createdAt: "2026-10-03", messages: [{ role: "user", text: "Research", createdAt: "2026-10-03", attachments: ["original-file"] }], attachments: [{ id: "original-file", name: "notes.txt", encoding: "base64", data: Buffer.from("Research 🌍").toString("base64"), mimeType: "incorrect/on-purpose", text: "Untrusted cached text" }], nativeSessionId: "never-resume", accountId: "never-import", projectId: "never-import" };

describe("conversation import", () => {
	it("waits for staged import cleanup before closing the workspace", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-import-close-")); const runtime = new WorkspaceRuntime(root); let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; }); const original = runtime.attachments.prepare.bind(runtime.attachments);
		vi.spyOn(runtime.attachments, "prepare").mockImplementationOnce(async (...arguments_) => { await gate; return original(...arguments_); });
		try {
			const importing = runtime.importTask({ type: "create-task", harness: "codex", mode: "chat", model: "default" }, parseConversation(JSON.stringify(snapshot)));
			const rejected = expect(importing).rejects.toThrow("shutting down"); const closing = runtime.close(); release(); await rejected; await closing;
			expect(readdirSync(path.join(root, "attachments"))).toEqual([]);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});
	it("cleans prepared files if the selected task destination is unavailable", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-import-destination-")); const runtime = new WorkspaceRuntime(root);
		try {
			await expect(runtime.importTask({ type: "create-task", harness: "codex", mode: "chat", model: "default", projectId: "missing" }, parseConversation(JSON.stringify(snapshot)))).rejects.toThrow("Project");
			expect(runtime.store.get().tasks).toEqual([]); expect(readdirSync(path.join(root, "attachments"))).toEqual([]);
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("restores files and messages into a fresh selected harness without executing anything", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-import-")); const factory = vi.fn(); const runtime = new WorkspaceRuntime(root, factory);
		try {
			const result = await runtime.importTask({ type: "create-task", harness: "claude", mode: "plan", model: "chosen-model" }, parseConversation(JSON.stringify(snapshot)));
			const task = runtime.store.getTask(result.taskId); expect(factory).not.toHaveBeenCalled(); expect(task).toMatchObject({ title: "Imported research", harness: "claude", mode: "plan", model: "chosen-model", status: "idle", queue: [], handoffFrom: "codex" });
			expect(task.nativeSessionId).toBeUndefined(); expect(task.accountId).toBeUndefined(); expect(task.projectId).toBeUndefined();
			const file = task.messages[0].attachments![0]; expect(file.id).not.toBe("original-file"); expect(file.taskId).toBe(task.id); expect(file.mimeType).toBe("text/plain"); expect((await runtime.attachments.read(file.id)).text).toBe("Research 🌍");
			const roundTrip = parseConversation(await taskExport(task, "json", runtime.attachments)); expect(roundTrip.attachments[0].bytes.toString()).toBe("Research 🌍"); expect(roundTrip.messages[0].text).toBe("Research");
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it("removes staged files and commits no partial task when attachment validation fails", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-import-failure-")); const runtime = new WorkspaceRuntime(root);
		try {
			const conversation = parseConversation(JSON.stringify({ ...snapshot, attachments: [...snapshot.attachments, { id: "binary", name: "bad.bin", encoding: "base64", data: Buffer.from([0, 1, 2]).toString("base64") }] }));
			await expect(runtime.importTask({ type: "create-task", harness: "codex", mode: "chat", model: "default" }, conversation)).rejects.toThrow("UTF-8 text");
			expect(runtime.store.get().tasks).toEqual([]); expect(readdirSync(path.join(root, "attachments"))).toEqual([]);
		} finally { await runtime.close(); rmSync(root, { recursive: true, force: true }); }
	});
	it.each([
		{ ...snapshot, version: 999 },
		{ ...snapshot, attachments: [...snapshot.attachments, ...snapshot.attachments] },
		{ ...snapshot, messages: [{ ...snapshot.messages[0], attachments: ["missing"] }] },
		{ ...snapshot, messages: [{ ...snapshot.messages[0], role: "executable" }] },
		{ ...snapshot, attachments: [{ ...snapshot.attachments[0], data: "!!!=" }] },
	])("rejects malformed portable data", value => { expect(() => parseConversation(JSON.stringify(value))).toThrow(); });
	it("reads only validated UTF-8 conversation files", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "phaseo-import-read-")); const filename = path.join(root, "conversation.json");
		try { writeFileSync(filename, JSON.stringify(snapshot)); expect((await readConversation(filename)).title).toBe("Imported research"); writeFileSync(filename, Buffer.from([255])); await expect(readConversation(filename)).rejects.toThrow(); }
		finally { rmSync(root, { recursive: true, force: true }); }
	});
});
