import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceStore } from "./workspaceStore";
import { validateCommand } from "../shared/workspace";

describe("workspace durability", () => {
	it("persists attachment references and rejects files imported for another task", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", mode: "chat", model: "default" });
			store.saveAttachment({ id: "attachment", taskId: task.id, name: "notes.txt", kind: "text", mimeType: "text/plain", size: 5 });
			expect(store.apply({ type: "send", id: task.id, text: "Review", attachments: ["attachment"] }).queue[0].attachments?.[0].name).toBe("notes.txt");
			const other = store.apply({ type: "create-task", harness: "codex", mode: "chat", model: "default" });
			expect(() => store.apply({ type: "send", id: other.id, text: "Review", attachments: ["attachment"] })).toThrow("another task");
		} finally { store.close(); }
	});
	it("recovers interrupted work and preserves queue order after restart", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-workspace-"));
		const filename = path.join(directory, "workspace.sqlite");
		let store = new WorkspaceStore(filename);
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "code" });
			store.apply({ type: "send", id: task.id, text: "First" });
			store.apply({ type: "send", id: task.id, text: "Second" });
			const queued = store.getTask(task.id);
			store.apply({ type: "queue-move", id: task.id, messageId: queued.queue[1].id, direction: "up" });
			store.apply({ type: "queue-edit", id: task.id, messageId: queued.queue[0].id, text: "Edited first" });
			const running = store.getTask(task.id); running.status = "running"; store.saveTask(running);
			store.close(); store = new WorkspaceStore(filename);
			expect(store.getTask(task.id).status).toBe("interrupted");
			expect(store.getTask(task.id).queue.map(message => message.text)).toEqual(["Second", "Edited first"]);
			expect(() => store.apply({ type: "queue-edit", id: task.id, messageId: "missing", text: "Lost" })).toThrow("no longer queued");
		} finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("rejects missing projects and archiving active work", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			expect(() => store.apply({ type: "create-task", projectId: "missing", harness: "codex", model: "default", mode: "code" })).toThrow("Project");
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "code" });
			task.status = "running"; store.saveTask(task);
			expect(() => store.apply({ type: "update-task", id: task.id, archived: true })).toThrow("Stop");
		} finally { store.close(); }
	});
	it("forks visible history without claiming native session continuity", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "claude", model: "default", mode: "chat" });
			task.nativeSessionId = "native"; store.saveTask(task);
			const fork = store.apply({ type: "fork", id: task.id });
			expect(fork.parentId).toBe(task.id); expect(fork.nativeSessionId).toBeUndefined();
		} finally { store.close(); }
	});
});

describe("IPC validation", () => {
	it("rejects API credentials embedded in endpoint query strings", () => {
		expect(() => validateCommand({ type: "add-account", name: "API", harness: "phaseo", kind: "api", apiKey: "secret", endpoint: "https://api.example.test/v1?api_key=secret" })).toThrow("query parameters");
	});
	it.each([null, {}, { type: "send", id: "x", text: "" }, { type: "update-task", id: "x", pinned: "yes" }, { type: "create-task", harness: "unknown", model: "default", mode: "chat" }])("rejects malformed input %j", value => {
		expect(() => validateCommand(value)).toThrow();
	});
});
