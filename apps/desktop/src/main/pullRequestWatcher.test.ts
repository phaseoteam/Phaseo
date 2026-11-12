import { describe, expect, it, vi } from "vitest";
import type { PullRequestView, TaskPullRequestLink } from "../shared/pullRequestView";
import { newPullRequestWatch, pullRequestWatchReadFailureLimit } from "../shared/pullRequestWatch";
import { PullRequestWatcher, type PullRequestWatchTarget } from "./pullRequestWatcher";

const watch = newPullRequestWatch("2026-10-16T10:00:00Z");
const link = (extra: Partial<TaskPullRequestLink> = {}): TaskPullRequestLink => ({ repository: "owned/repo", number: 42, url: "https://github.com/owned/repo/pull/42", linkedAt: watch.startedAt, source: "manual", watching: true, watch, ...extra });
const view = (extra: Partial<PullRequestView> = {}) => ({ repository: "owned/repo", number: 42, state: "OPEN", headOid: "a".repeat(40), base: "main", mergeable: "MERGEABLE", checkRuns: [{ name: "lint", status: "failure" }], comments: [], viewer: { login: "agent", canUpdate: true, canMerge: true, canDeleteBranch: false }, authorActor: null, ...extra }) as unknown as PullRequestView;
function setup(targets: PullRequestWatchTarget[], read: () => Promise<PullRequestView>) {
	let now = Date.parse("2026-10-16T10:00:00Z");
	const record = vi.fn(), snapshot = vi.fn(), reader = vi.fn(read);
	const watcher = new PullRequestWatcher({ targets: () => targets, read: reader, record, snapshot, now: () => now });
	return { watcher, record, snapshot, read: reader, advance: (ms: number) => { now += ms; } };
}

describe("PullRequestWatcher", () => {
	it("reads each watched pull request once for every chat watching it and records the update", async () => {
		const { watcher, record, read, snapshot } = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link() }, { taskId: "b", cwd: "/b", inactive: false, link: link({ repository: "Owned/Repo" }) }, { taskId: "c", cwd: "/c", inactive: false, link: link({ watching: undefined, watch: undefined }) }], async () => view());
		await watcher.sweep();
		expect(read).toHaveBeenCalledOnce(); expect(snapshot).toHaveBeenCalledOnce();
		expect(record).toHaveBeenCalledTimes(2);
		expect(record.mock.calls[0]).toEqual(["a", expect.objectContaining({ number: 42 }), watch.startedAt, expect.objectContaining({ failedChecks: ["lint"] }), expect.objectContaining({ summary: "#42: checks failed", outcome: "failed" })]);
	});
	it("ends quietly when merged or the chat takes no wakes, and with an update when closed", async () => {
		const merged = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link({ snapshot: { state: "merged" } as TaskPullRequestLink["snapshot"] }) }, { taskId: "b", cwd: "/b", inactive: true, link: link({ number: 7 }) }], async () => view());
		await merged.watcher.sweep();
		expect(merged.read).not.toHaveBeenCalled();
		expect(merged.record.mock.calls.map(call => [call[0], call[3], call[4]])).toEqual([["a", null, undefined], ["b", null, undefined]]);
		const closed = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link() }], async () => view({ state: "CLOSED" }));
		await closed.watcher.sweep();
		expect(closed.record).toHaveBeenCalledWith("a", expect.anything(), watch.startedAt, null, expect.objectContaining({ summary: "#42: closed, stopped watching" }));
	});
	it("gives up after eight failed reads, but only waits out rate limits", async () => {
		const failing = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link() }], async () => { throw new Error("Could not load this pull request."); });
		for (let pass = 1; pass < pullRequestWatchReadFailureLimit; pass++) await failing.watcher.sweep();
		expect(failing.record).not.toHaveBeenCalled();
		await failing.watcher.sweep();
		expect(failing.record).toHaveBeenCalledWith("a", expect.anything(), watch.startedAt, null, expect.objectContaining({ summary: "#42: stopped watching, could not read it" }));

		const limited = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link() }], async () => { throw new Error("gh failed", { cause: { stderr: "gh: API rate limit exceeded (HTTP 403)" } }); });
		await limited.watcher.sweep(); await limited.watcher.sweep();
		expect(limited.read).toHaveBeenCalledOnce();
		limited.advance(2 * 60_000); await limited.watcher.sweep();
		expect(limited.read).toHaveBeenCalledTimes(2);
		for (let pass = 0; pass < 20; pass++) { limited.advance(30 * 60_000); await limited.watcher.sweep(); }
		expect(limited.record).not.toHaveBeenCalled();
	});
	it("records a quiet pass only when the watch moved", async () => {
		const settled = { ...watch, headSha: "a".repeat(40), failedChecks: ["lint"] };
		const { watcher, record } = setup([{ taskId: "a", cwd: "/a", inactive: false, link: link({ watch: settled }) }], async () => view());
		await watcher.sweep();
		expect(record).not.toHaveBeenCalled();
	});
});

describe("watch updates in a chat", () => {
	it("wake an idle chat with a notice message, notify, and end watches when the person stops the chat", async () => {
		const { mkdtempSync, rmSync } = await import("node:fs"), { tmpdir } = await import("node:os"), path = await import("node:path"), { WorkspaceRuntime } = await import("./workspaceRuntime");
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-pr-watch-")), run = vi.fn(async () => {});
		const runtime = new WorkspaceRuntime(directory, () => ({ run, cancel: async () => {} }));
		try {
			const task = runtime.store.apply({ type: "create-task", harness: "codex", model: "owned", mode: "code" }), target = { repository: "owned/repo", number: 42 };
			await runtime.command({ type: "link-pull-request", id: task.id, reference: "https://github.com/owned/repo/pull/42" });
			await runtime.command({ type: "watch-pull-request", id: task.id, ...target, watching: true });
			const [watched] = runtime.pullRequestWatchTargets();
			expect(watched).toMatchObject({ taskId: task.id, cwd: directory, inactive: false });
			const notice = vi.fn(); runtime.onPullRequestNotice = notice;
			runtime.recordPullRequestWatch(task.id, target, watched.link.watch!.startedAt, watched.link.watch!, { text: "Update on pull request #42", summary: "#42: checks failed", outcome: "failed" });
			await vi.waitFor(() => expect(runtime.store.getTask(task.id).status).toBe("completed"));
			expect(run).toHaveBeenCalledOnce();
			expect(runtime.store.getTask(task.id).messages[0]).toMatchObject({ role: "user", text: "Update on pull request #42", notice: { summary: "#42: checks failed" } });
			expect(notice).toHaveBeenCalledWith(task.id, "#42: checks failed", "failed");
			await runtime.command({ type: "cancel", id: task.id });
			expect(runtime.pullRequestWatchTargets()).toEqual([]);
		} finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
