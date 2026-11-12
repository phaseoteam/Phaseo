import { describe, expect, it } from "vitest";
import type { Project, Task } from "../../shared/workspace";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { phoneChat, phoneDetail } from "./phoneChats";

const parent = { id: "repo", name: "Phaseo", directory: "/work/repo", createdAt: "2026-11-01T09:00:00.000Z" } as Project;
const worktree = { id: "wt-1", name: "Phaseo · fix", directory: "/work/wt-1", createdAt: "2026-11-01T09:00:00.000Z", worktree: { sourceProjectId: "repo", branch: "fix/thing", baseCommit: "f".repeat(40) } } as Project;
const overview = (projectId?: string) => ({ id: "chat-1", title: "Fix it", mode: "code", status: "completed", updatedAt: "2026-11-01T09:00:00.000Z", ...projectId ? { projectId } : {} }) as unknown as TaskOverview;

describe("phoneChat", () => {
	it("lists a worktree chat under its parent project but keeps the worktree's own project for Git", () => {
		expect(phoneChat(overview("wt-1"), [parent, worktree])).toMatchObject({ projectId: "repo", project: "Phaseo", branch: "fix/thing", workProjectId: "wt-1" });
	});

	it("sends no separate work project for a chat in the project itself", () => {
		expect(phoneChat(overview("repo"), [parent, worktree])).not.toHaveProperty("workProjectId");
	});
});

describe("phoneDetail questions", () => {
	const detail = (questions: Task["questions"]) => phoneDetail({ id: "chat-1", harness: "codex", questions } as unknown as Task, overview(), []);

	it("carries an option's value when it differs from its label, so the phone answers with what the computer checks", () => {
		const [request] = detail([{ id: "q", questions: [{ id: "pick", header: "Plan", question: "Which plan?", options: [{ label: "Pro plan", value: "pro" }, { label: "Free" }] }] }] as Task["questions"]).questions;
		expect(request!.questions[0]!.options).toEqual([{ label: "Pro plan", value: "pro" }, { label: "Free" }]);
	});

	it("offers Yes and No for a yes/no question, as the window does", () => {
		const [request] = detail([{ id: "q", questions: [{ id: "ok", header: "", question: "Go ahead?", input: { kind: "boolean" } }] }] as unknown as Task["questions"]).questions;
		expect(request!.questions[0]!.options).toEqual([{ label: "Yes", value: "true" }, { label: "No", value: "false" }]);
	});
});
