import { expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { validateCommand } from "../shared/workspace";

it("branches only through the chosen message, with portable history rather than a later native session", () => {
	const store = new WorkspaceStore(":memory:");
	try {
		const task = store.apply({ type: "create-task", harness: "codex", model: "fixture", mode: "code" });
		task.nativeSessionId = "native-later";
		task.messages = [
			{ id: "first", role: "user", text: "First", createdAt: task.createdAt },
			{ id: "answer", role: "assistant", text: "Answer", createdAt: task.createdAt },
			{ id: "later", role: "user", text: "Later", createdAt: task.createdAt },
		];
		task.activities = [{ id: "first:tool", type: "tool", title: "Read", text: "First result" }, { id: "later:tool", type: "tool", title: "Read", text: "Later result" }];
		store.saveTask(task);
		const branch = store.apply({ type: "fork", id: task.id, messageId: "answer" });
		expect(branch.messages.map(message => message.id)).toEqual(["first", "answer"]);
		expect(branch.activities?.map(activity => activity.id)).toEqual(["first:tool"]);
		expect(branch.nativeForkFrom).toBeUndefined(); expect(branch.handoffFrom).toBe("codex");
		expect(store.getTask(task.id).messages).toHaveLength(3);
	} finally { store.close(); }
});

it("persists permissions and refuses invalid or mid-run permission changes", () => {
	const store = new WorkspaceStore(":memory:");
	try {
		expect(() => validateCommand({ type: "create-task", harness: "codex", model: "fixture", mode: "code", permissionMode: "invalid" })).toThrow("permissions");
		const task = store.apply({ type: "create-task", harness: "codex", model: "fixture", mode: "code", permissionMode: "full-access" });
		expect(store.getTask(task.id).permissionMode).toBe("full-access");
		task.status = "running"; store.saveTask(task);
		expect(() => store.apply({ type: "update-task", id: task.id, permissionMode: "supervised" })).toThrow("Stop");
	} finally { store.close(); }
});
