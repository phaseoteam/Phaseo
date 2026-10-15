import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import type { PullRequestLinkSnapshot } from "../shared/pullRequestView";

const snapshot: PullRequestLinkSnapshot = { title: "Owned", state: "open", draft: false, mergeable: "MERGEABLE", checks: "passing", review: "approved", additions: 1, deletions: 2, author: "fixture", head: "feature", base: "main", updatedAt: "2026-10-16T00:00:00Z" };
describe("chat pull request links", () => {
	it("links once, watches, records snapshots in the overview and unlinks without moving the chat", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "opencode", model: "default", mode: "code" });
			const updatedAt = store.getTask(task.id).updatedAt;
			store.apply({ type: "link-pull-request", id: task.id, reference: "#42", repository: "owned/repo", number: 42 });
			store.apply({ type: "link-pull-request", id: task.id, reference: "#42", repository: "Owned/Repo", number: 42 });
			expect(store.getTask(task.id).pullRequests).toEqual([expect.objectContaining({ repository: "owned/repo", number: 42, url: "https://github.com/owned/repo/pull/42", source: "manual" })]);
			expect(store.getTask(task.id).updatedAt).toBe(updatedAt);
			store.apply({ type: "watch-pull-request", id: task.id, repository: "owned/repo", number: 42, watching: true });
			expect(store.syncPullRequestSnapshot("OWNED/repo", 42, snapshot)).toBe(true);
			expect(store.syncPullRequestSnapshot("owned/repo", 42, snapshot)).toBe(false);
			expect(store.syncPullRequestSnapshot("owned/repo", 43, snapshot)).toBe(false);
			expect(store.getOverview().tasks.find(value => value.id === task.id)?.pullRequests).toEqual([expect.objectContaining({ number: 42, watching: true, snapshot })]);
			expect(() => store.apply({ type: "unlink-pull-request", id: task.id, repository: "owned/repo", number: 7 })).toThrow("not linked");
			store.apply({ type: "unlink-pull-request", id: task.id, repository: "owned/repo", number: 42 });
			expect(store.getTask(task.id).pullRequests).toBeUndefined();
			expect(() => store.apply({ type: "link-pull-request", id: task.id, reference: "#42" })).toThrow("Choose");
		} finally { store.close(); }
	});
});
