import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceRuntime } from "./workspaceRuntime";
import type { AgentAdapter } from "./agentAdapter";
import { threadTools } from "./threadTools";
import type { IssueDetails } from "../shared/issueView";

async function withRuntime(test: (runtime: WorkspaceRuntime, directory: string) => Promise<void>) {
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-triage-issues-"));
	// Turns never finish, so chats stay as the test leaves them.
	const runtime = new WorkspaceRuntime(path.join(directory, "workspace"), (): AgentAdapter => ({ run: () => new Promise(() => undefined), cancel: async () => {} }));
	try { await test(runtime, directory); } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
}
const chat = async (runtime: WorkspaceRuntime, projectId?: string) => {
	const before = new Set(runtime.store.getOverview().tasks.map(task => task.id));
	return (await runtime.command({ type: "create-task", harness: "codex", model: "owned", mode: "code", permissionMode: "full-access", projectId })).tasks.find(task => !before.has(task.id))!.id;
};
const triageProject = (runtime: WorkspaceRuntime, directory: string) => {
	const folder = path.join(directory, "phaseo-821b26a8e7c9"); mkdirSync(folder);
	const project = runtime.store.addProject(folder);
	project.triage = { version: "0.1.0", commit: "821b26a8e7c9d1f2a3b4c5d6e7f8091a2b3c4d5e", exact: true, repository: "owner/test" };
	runtime.store.saveProject(project);
	return project.id;
};
const issue = (repository: string, number: number): IssueDetails => ({ repository, number, url: `https://github.com/${repository}/issues/${number}`, title: "Sidebar crashes", body: "", state: "open", author: "me", labels: [], assignees: [], createdAt: "2026-10-30T10:00:00Z", updatedAt: "2026-10-30T10:00:00Z", comments: [], commentCount: 0, fetchedAt: "2026-10-30T10:00:00Z" });

describe("triage issue drafts", () => {
	it("are offered only to top-level chats in a triage checkout", () => withRuntime(async (runtime, directory) => {
		const plain = await chat(runtime), triage = await chat(runtime, triageProject(runtime, directory));
		expect(runtime.threadTools(plain).draftIssue).toBeUndefined();
		expect(threadTools(runtime.threadTools(plain)).map(tool => tool.id)).not.toContain("draft_issue");
		expect(threadTools(runtime.threadTools(triage)).map(tool => tool.id)).toContain("draft_issue");
		const child = await runtime.threadTools(triage).delegate({ requestId: "c", title: "Child", prompt: "Look", background: true });
		expect(runtime.threadTools(child.id).draftIssue).toBeUndefined();
	}));

	it("keep the agent's draft for the person, who files it with their edits and gets it linked to the chat", () => withRuntime(async (runtime, directory) => {
		const id = await chat(runtime, triageProject(runtime, directory)), tools = runtime.threadTools(id);
		const created = vi.fn(async (_root: string, repository: string) => `Creating issue in ${repository}\n\nhttps://github.com/${repository}/issues/14\n`);
		runtime.createIssue = created;
		runtime.github = { readIssue: async (_root, repository, number) => issue(repository, number), referenceContext: async () => "" };
		expect(tools.draftIssue!({ title: "First", body: "Old" })).toMatchObject({ saved: true, repository: "owner/test" });
		expect(tools.draftIssue!({ title: "Sidebar crashes", body: "Steps" })).toMatchObject({ saved: true });
		// Drafting files nothing, even with full access: only the person's action does.
		expect(created).not.toHaveBeenCalled();
		expect(runtime.store.getTask(id).issueDraft).toMatchObject({ repository: "owner/test", title: "Sidebar crashes", body: "Steps", status: "draft" });

		const filed = await runtime.issueDraftAction(id, "file", { title: "Sidebar crashes on open", body: "Steps, edited" });
		expect(created).toHaveBeenCalledOnce();
		expect(created.mock.calls[0].slice(1)).toEqual(["owner/test", "Sidebar crashes on open", "Steps, edited"]);
		expect(filed).toMatchObject({ status: "filed", number: 14, url: "https://github.com/owner/test/issues/14", title: "Sidebar crashes on open" });
		expect(runtime.store.getTask(id).issues).toEqual([expect.objectContaining({ repository: "owner/test", number: 14, source: "user" })]);
		await expect(runtime.issueDraftAction(id, "file")).rejects.toThrow("no issue draft waiting");
	}));

	it("file once when asked twice, and can be discarded instead", () => withRuntime(async (runtime, directory) => {
		const projectId = triageProject(runtime, directory), id = await chat(runtime, projectId);
		let finish: (url: string) => void = () => undefined;
		runtime.createIssue = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
		runtime.github = { readIssue: async (_root, repository, number) => issue(repository, number), referenceContext: async () => "" };
		runtime.threadTools(id).draftIssue!({ title: "Crash", body: "Steps" });
		const first = runtime.issueDraftAction(id, "file");
		await expect(runtime.issueDraftAction(id, "file")).rejects.toThrow("already being filed");
		await expect(runtime.issueDraftAction(id, "discard")).rejects.toThrow("already being filed");
		finish("https://github.com/owner/test/issues/15");
		await expect(first).resolves.toMatchObject({ status: "filed", number: 15 });
		expect(runtime.createIssue).toHaveBeenCalledOnce();

		const other = await chat(runtime, projectId);
		runtime.threadTools(other).draftIssue!({ title: "Not ours", body: "Their setup" });
		await expect(runtime.issueDraftAction(other, "discard")).resolves.toMatchObject({ status: "discarded" });
		await expect(runtime.issueDraftAction(other, "file")).rejects.toThrow("no issue draft waiting");
	}));

	it("report a failed filing and keep the draft to try again", () => withRuntime(async (runtime, directory) => {
		const id = await chat(runtime, triageProject(runtime, directory));
		runtime.createIssue = vi.fn(async () => { throw new Error("gh: HTTP 403"); });
		runtime.threadTools(id).draftIssue!({ title: "Crash", body: "Steps" });
		await expect(runtime.issueDraftAction(id, "file")).rejects.toThrow("HTTP 403");
		expect(runtime.store.getTask(id).issueDraft?.status).toBe("draft");
	}));
});
