import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseReport } from "../../shared/factory/report";
import type { AgentProfile, Run, RunReport, WorkItem } from "../../shared/factory/types";
import { FactoryStore, type FactoryWork } from "./store";

/** A demo store with a fake Phaseo Work, and the demo's issue 3117 marked as a Phaseo Work item. */
async function storeWithWork() {
	const events: string[] = [];
	const ended: Run[] = [];
	let answer: (id: string) => void = () => undefined;
	const work: FactoryWork = {
		poll: async () => [],
		runStarted: (item: WorkItem, run: Run, agent: AgentProfile) => {
			events.push(`started ${item.phaseo?.number} ${run.stage} ${agent.id}`);
			return new Promise<string | undefined>((resolve) => { answer = resolve; });
		},
		runEnded: async (item: WorkItem, run: Run) => { events.push(`ended ${item.phaseo?.number} ${run.status}`); ended.push(run); },
		pullOpened: async () => undefined,
	};
	const threads = { ensureParent: async () => "thread", start: async () => ({ send: () => true, stop: () => undefined }) };
	const store = new FactoryStore({ dataDir: await mkdtemp(path.join(os.tmpdir(), "factory-work-")), demo: true, broadcast: () => undefined, persistence: { read: () => undefined, write: () => undefined }, agents: async () => [], threads, work });
	const finish = (runId: string, report: RunReport) => (store as unknown as { finishRun: (id: string, result: object) => void }).finishRun(runId, { status: "succeeded", summary: report.summary, report });
	const item = () => store.get().items.find((candidate) => candidate.number === 3117)!;
	(store as unknown as { patchItem: (id: string, patch: (item: WorkItem) => WorkItem) => void }).patchItem(item().id, (current) => ({ ...current, phaseo: { workspaceId: "ws-1", number: 41, url: "https://phaseo.app/work/41", state: "todo", priority: 2, githubIssue: 3117 } }));
	return { store, finish, item, events, ended, answer: (id: string) => answer(id) };
}

describe("FactoryStore with Phaseo Work", () => {
	it("reports a run on a Phaseo item when it starts and when it ends, on the same Phaseo run", async () => {
		const { store, finish, item, events, ended, answer } = await storeWithWork();
		const run = await store.startRun({ itemId: item().id, stage: "triage", agentId: "claude-sonnet" });
		expect(events).toEqual(["started 41 triage claude-sonnet"]);
		answer("wr-1");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(store.get().runs.find((candidate) => candidate.id === run.id)?.workRunId).toBe("wr-1");
		finish(run.id, parseReport("Summary: The title pluralises wrongly.\nVerdict: Bug"));
		expect(events).toEqual(["started 41 triage claude-sonnet", "ended 41 succeeded"]);
		expect(ended[0]).toMatchObject({ id: run.id, workRunId: "wr-1", status: "succeeded", report: { summary: "The title pluralises wrongly." } });
	});

	it("reports nothing for items that aren't from Phaseo Work", async () => {
		const { store, events } = await storeWithWork();
		const other = store.get().items.find((candidate) => candidate.number !== 3117 && candidate.kind === "issue" && !candidate.phaseo && !candidate.linked && !candidate.branch && !store.get().runs.some((run) => run.itemId === candidate.id))!;
		await store.startRun({ itemId: other.id, stage: "triage", agentId: "claude-sonnet" });
		expect(events).toEqual([]);
	});

	it("carries a Phaseo-only item's stages, runs, thread and worktree over when it gets a GitHub issue", async () => {
		const { store } = await storeWithWork();
		const inner = store as unknown as {
			overlays: Record<string, { branch?: string; worktreeKey?: string; stages?: Record<string, { status: string }> }>;
			snapshot: { runs: Run[]; threads: Record<string, string> };
			work: WorkItem[];
			carryRenamedWork: () => void;
		};
		const before = "acme/app#work-12";
		const after = "acme/app#57";
		inner.overlays[before] = { branch: "factory/work-12-fix-login", stages: { triage: { status: "passed" }, fix: { status: "running" } } };
		inner.overlays[after] = { branch: undefined, stages: { triage: { status: "idle" }, review: { status: "failed" } } };
		inner.snapshot.runs = [...inner.snapshot.runs, { id: "run-x", itemId: before, stage: "fix", agentId: "claude-sonnet", status: "running", startedAt: 1, log: [] } as Run];
		inner.snapshot.threads = { ...inner.snapshot.threads, [before]: "thread-12" };
		inner.work = [{ id: after, repo: "acme/app", number: 57, kind: "issue", phaseo: { workspaceId: "ws-1", number: 12, url: "https://phaseo.app/work/12", state: "in_progress", priority: 2, githubIssue: 57 } } as WorkItem];
		inner.carryRenamedWork();
		expect(inner.overlays[before]).toBeUndefined();
		expect(inner.overlays[after]).toMatchObject({ branch: "factory/work-12-fix-login", worktreeKey: "work-12", stages: { triage: { status: "passed" }, fix: { status: "running" }, review: { status: "failed" } } });
		expect(inner.snapshot.runs.find((run) => run.id === "run-x")?.itemId).toBe(after);
		expect(inner.snapshot.threads[after]).toBe("thread-12");
		expect(inner.snapshot.threads[before]).toBeUndefined();
	});

	it("keeps only valid Phaseo Work settings", async () => {
		const { store } = await storeWithWork();
		await store.updateSettings({ phaseoWork: { enabled: true, workspaceId: "ws-1", engineer: false, mine: true, label: " Agent ", token: "x" } as never });
		expect(store.get().settings.phaseoWork).toEqual({ enabled: true, workspaceId: "ws-1", engineer: false, mine: true, label: "agent" });
	});
});
