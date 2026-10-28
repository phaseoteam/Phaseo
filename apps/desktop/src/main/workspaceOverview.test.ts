import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { workspaceOverview } from "../shared/workspaceOverview";
import { inboxReason } from "../shared/inbox";

describe("workspace metadata snapshots", () => {
	it("keeps notification identity stable during streaming and distinguishes replacement requests", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.messages = [{ id: "first-user", role: "user", text: "Secret instruction", createdAt: "" }, { id: "reply", role: "assistant", text: "Secret answer", createdAt: "" }];
			task.forms = [{ id: "first-form", form: { id: "native-form", title: "Secret form", fields: [{ key: "answer", type: "string" }] } }];
			store.saveTask(task);
			const original = store.getOverview().tasks[0].attentionKey;
			task.title = "Renamed"; task.messages[1].text += " More tokens"; task.error = "Changed error"; store.saveTask(task);
			expect(store.getOverview().tasks[0].attentionKey).toBe(original);
			task.forms![0].id = "replacement-form"; store.saveTask(task);
			expect(store.getOverview().tasks[0].attentionKey).not.toBe(original);
			expect(store.getOverview()).toEqual(workspaceOverview(store.get()));
			task.messages.push({ id: "later-user", role: "user", text: "Later instruction", createdAt: "" }); store.saveTask(task);
			expect(JSON.parse(store.getOverview().tasks[0].attentionKey)[0]).toBe("later-user");
			expect(store.getOverview()).toEqual(workspaceOverview(store.get()));
		} finally { store.close(); }
	});
	it("excludes conversation, draft, native request and activity bodies", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.messages = [{ id: "message", role: "user", text: "private message", createdAt: task.createdAt }];
			task.queue = [{ id: "draft", text: "private draft", createdAt: task.createdAt }];
			task.steering = [{ id: "steer", text: "private steering", createdAt: task.createdAt, status: "unconfirmed" }];
			task.approvals = [{ id: "approval", method: "private method", description: "private approval" }];
			task.questions = [{ id: "question", questions: [{ id: "q", header: "private header", question: "private question" }] }];
			task.activities = [{ id: "activity", type: "reasoning", title: "private title", text: "private reasoning" }];
			task.nativeModels = [{ id: "private model", name: "private model" }]; task.nativeSessionId = "private session"; task.error = "private error";
			store.saveTask(task);
			const metadata = store.getOverview();
			expect(JSON.stringify(metadata)).not.toContain("private");
			expect(metadata.tasks[0]).toMatchObject({ id: task.id, revision: task.revision, approvalsCount: 1, answersCount: 1, steeringReviewCount: 1, attentionReason: "Approval needed" });
			for (const field of ["messages", "queue", "steering", "approvals", "questions", "forms", "activities", "nativeModels", "nativeSessionId", "error"]) expect(metadata.tasks[0]).not.toHaveProperty(field);
			expect(metadata).toEqual(workspaceOverview(store.get()));
			expect(store.getTask(task.id).messages[0].text).toBe("private message");
		} finally { store.close(); }
	});
	it("preserves attention priority and archive behavior without request bodies", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			for (const status of ["idle", "running", "waiting", "failed", "interrupted", "limited", "completed"] as const) {
				const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
				task.status = status; store.saveTask(task);
				for (const requests of [false, true]) {
					if (requests) task.questions = [{ id: "request", questions: [] }];
					store.saveTask(task);
					expect(store.getOverview().tasks.find(value => value.id === task.id)?.attentionReason).toBe(inboxReason(task));
				}
				task.archived = true; store.saveTask(task);
				expect(store.getOverview().tasks.find(value => value.id === task.id)?.attentionReason).toBeUndefined();
			}
		} finally { store.close(); }
	});
});
