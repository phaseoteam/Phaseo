import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
import { exportFilename, saveTaskExport, taskExport } from "./taskExport";

const task: Task = { id: "local-task", title: "Conversation", harness: "codex", mode: "chat", model: "default", status: "completed", messages: [{ id: "message", role: "user", text: "Hello", createdAt: "2026-10-03" }], queue: [], pinned: false, archived: false, createdAt: "2026-10-03", updatedAt: "2026-10-03", accountId: "private-account", projectId: "private-project", nativeSessionId: "private-session" };

describe("conversation export", () => {
	it("exports original attachments once and omits private runtime/account state", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-export-")); const filename = path.join(directory, "fixture.pdf"); const bytes = Buffer.from("PDF original fixture"); writeFileSync(filename, bytes);
		try {
			const attachment = { id: "file", taskId: task.id, name: "notes.pdf", kind: "text" as const, mimeType: "application/pdf", size: bytes.length, pages: 1 };
			const read = vi.fn(async () => ({ ...attachment, filePath: filename, text: "Page 1\nExtracted text" }));
			const exported = JSON.parse(await taskExport({ ...task, messages: [...task.messages, { ...task.messages[0], attachments: [attachment] }, { ...task.messages[0], attachments: [attachment] }] }, "json", { read }));
			expect(read).toHaveBeenCalledOnce(); expect(exported).toMatchObject({ format: "phaseo-conversation", version: 1, attachments: [{ id: "file", name: "notes.pdf", data: bytes.toString("base64"), text: "Page 1\nExtracted text" }] });
			expect(exported.messages[1].attachments).toEqual(["file"]); expect(JSON.stringify(exported)).not.toMatch(/private-account|private-project|private-session|filePath|taskId/);
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("preserves document fences and embedded images in Markdown", async () => {
		const document = { id: "doc", taskId: task.id, name: "[notes].md", kind: "text" as const, mimeType: "text/plain", size: 5 };
		const image = { ...document, id: "image", name: "picture.png", kind: "image" as const, mimeType: "image/png" };
		const exported = await taskExport({ ...task, title: "Title\n## injection", messages: [{ ...task.messages[0], delivery: "steer", attachments: [document, image] }] }, "markdown", { read: async id => id === "doc" ? { ...document, filePath: "", text: "```quoted```" } : { ...image, filePath: "", dataUrl: "data:image/png;base64,YWJj" } });
		expect(exported).toContain("# Title \\#\\# injection"); expect(exported).toContain("````\n```quoted```\n````"); expect(exported).toContain("data:image/png;base64,YWJj"); expect(exported).toContain("Steering instruction");
	});
	it("rejects oversized exports before reading files", async () => {
		const read = vi.fn(); await expect(taskExport({ ...task, messages: [{ ...task.messages[0], attachments: [{ id: "huge", taskId: task.id, name: "huge", kind: "text", mimeType: "text/plain", size: 101 * 1024 * 1024 }] }] }, "json", { read })).rejects.toThrow("100 MB"); expect(read).not.toHaveBeenCalled();
	});
	it("uses safe filenames and replaces exports without leftover temporary files", async () => {
		expect(exportFilename("CON.txt", "json")).toBe("Conversation.json"); expect(exportFilename("a/b: task", "markdown")).toBe("a-b- task.md");
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-export-write-")); const filename = path.join(directory, "conversation.md"); writeFileSync(filename, "Old");
		try { await saveTaskExport(filename, "New"); expect(readFileSync(filename, "utf8")).toBe("New"); expect(readdirSync(directory)).toEqual(["conversation.md"]); }
		finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
