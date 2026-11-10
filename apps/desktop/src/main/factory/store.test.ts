import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseReport } from "../../shared/factory/report";
import type { RunReport, WorkItem } from "../../shared/factory/types";
import type * as GithubModule from "./github";
const github = vi.hoisted(() => ({ failedLog: vi.fn(async () => "FAIL: expected 12.5") }));
vi.mock("./github", async (importOriginal) => ({ ...(await importOriginal<typeof GithubModule>()), failedLog: github.failedLog }));
import { FactoryStore, assertCanPush, pushTarget } from "./store";

/** The demo store runs nothing for real: runs start, and the test finishes them with the report an agent would give. */
async function demoStore() {
	const threads = { ensureParent: async () => "thread", start: async () => ({ send: () => true, stop: () => undefined }) };
	const store = new FactoryStore({ dataDir: await mkdtemp(path.join(os.tmpdir(), "factory-store-")), demo: true, broadcast: () => undefined, persistence: { read: () => undefined, write: () => undefined }, agents: async () => [], threads });
	const finish = (runId: string, report: RunReport) => (store as unknown as { finishRun: (id: string, result: object) => void }).finishRun(runId, { status: "succeeded", summary: report.summary, report });
	const item = (number: number) => store.get().items.find((candidate) => candidate.number === number)!;
	const run = (runId: string) => store.get().runs.find((candidate) => candidate.id === runId)!;
	return { store, finish, item, run };
}

describe("FactoryStore", () => {
	it("starts nothing on its own: a passed stage waits for a person", async () => {
		const { store, finish, item } = await demoStore();
		const started = await store.startRun({ itemId: item(3117).id, stage: "triage", agentId: "claude-sonnet" });
		finish(started.id, parseReport("Summary: The title pluralises wrongly.\nVerdict: Bug"));
		expect(item(3117).stages.triage.status).toBe("done");
		expect(item(3117).stages.reproduce.status).toBe("idle");
		expect(store.get().runs.filter((candidate) => candidate.itemId === item(3117).id && candidate.status === "running")).toHaveLength(0);
	});

	it("keeps an item's effort, clears it, and takes only plain level names", async () => {
		const { store, item } = await demoStore();
		store.setEffort(item(3117).id, "max");
		expect(item(3117).effort).toBe("max");
		store.setEffort(item(3117).id, null);
		expect(item(3117).effort).toBeUndefined();
		expect(() => store.setEffort(item(3117).id, "high; rm -rf /")).toThrow("Unsupported effort");
	});

	it("takes an issue to a pull request on Autopilot, one stage after another", async () => {
		const { store, finish, item } = await demoStore();
		const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
		const running = () => store.get().runs.find((candidate) => candidate.itemId === item(3117).id && candidate.status === "running");
		await store.act(item(3117).id, { id: "autopilot", label: "Autopilot to a pull request" });
		expect(item(3117).autopilot).toBeTruthy();
		expect(running()?.stage).toBe("triage");
		finish(running()!.id, parseReport("Summary: The title pluralises wrongly.\nVerdict: Bug"));
		await settle();
		expect(running()?.stage).toBe("reproduce");
		finish(running()!.id, parseReport("Summary: Fails.\nVerdict: Reproduced\nProof:\n- `npm test`: 1 failed"));
		await settle();
		expect(running()?.stage).toBe("fix");
		const fix = running()!.id;
		finish(fix, parseReport("Summary: Fixed.\nVerdict: Fixed\nProof:\n- `npm test`: 12 passed"));
		await settle();
		const pull = store.get().items.find((candidate) => candidate.kind === "pull" && candidate.linked === 3117);
		expect(pull?.state).toBe("draft");
		// The pull request is a fresh start: Autopilot ends at opening it.
		expect(pull?.autopilot).toBeUndefined();
		expect(item(3117).linked).toBe(pull?.number);
		expect(item(3117).autopilot).toBeUndefined();
		expect(store.get().runs.find((candidate) => candidate.id === fix)?.log.at(-1)?.text).toBe("Autopilot finished");
	});

	it("stops Autopilot as soon as a stage needs you, and when you stop it", async () => {
		const { store, finish, item } = await demoStore();
		const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
		const running = () => store.get().runs.find((candidate) => candidate.itemId === item(3117).id && candidate.status === "running");
		await store.act(item(3117).id, { id: "autopilot", label: "Autopilot to a pull request" });
		finish(running()!.id, parseReport("Summary: Can't tell which page.\nVerdict: Bug\nQuestion: Which page is this on?"));
		await settle();
		expect(item(3117).autopilot).toBeUndefined();
		expect(running()).toBeUndefined();
		expect(store.get().runs.find((candidate) => candidate.itemId === item(3117).id)?.log.at(-1)?.text).toBe("Autopilot stopped: Triage needs you");

		// Stopping by hand lets the running stage finish, and nothing starts after it.
		const again = await demoStore();
		await again.store.act(again.item(3117).id, { id: "autopilot", label: "Autopilot to a pull request" });
		await again.store.act(again.item(3117).id, { id: "stop-autopilot", label: "Stop autopilot" });
		const triage = again.store.get().runs.find((candidate) => candidate.itemId === again.item(3117).id && candidate.status === "running")!;
		again.finish(triage.id, parseReport("Summary: Pluralises wrongly.\nVerdict: Bug"));
		await settle();
		expect(again.item(3117).stages.reproduce.status).toBe("idle");
		expect(again.item(3117).autopilot).toBeUndefined();
	});

	it("keeps what agents learnt as notes, about the repository or this computer, and checks the ones it read", async () => {
		const { store, finish, item, run } = await demoStore();
		const first = await store.startRun({ itemId: item(3117).id, stage: "triage", agentId: "claude-sonnet" });
		// The run read the demo's notes in order of trust (pinned first), without the flagged one, and this computer's.
		const refs = run(first.id).noteRefs!;
		expect(refs).toEqual({ R1: "note-3", R2: "note-1", R3: "note-4", C1: "note-c1" });
		const r1 = refs.R1!;
		const r2 = refs.R2!;
		const report = parseReport([
			"Summary: Done.",
			"Verdict: Bug",
			"Remember:",
			"- repo: Compare page tests: pnpm --filter @phaseo/web test compare (checked: ran it, 14 passed)",
			"- computer: Git Bash breaks file:// URLs in Node imports (checked: the import failed from Git Bash)",
			"Notes check:",
			"- R1 held",
			"- R2 wrong: the gateway tests need Postgres now",
		].join("\n"));
		finish(first.id, report);
		const notes = store.get().notes["phaseo-app/phaseo"]!;
		expect(notes[0]).toMatchObject({ text: "Compare page tests: pnpm --filter @phaseo/web test compare", checked: "ran it, 14 passed", runId: first.id, agentId: "claude-sonnet" });
		expect(store.get().notes["@computer"]![0]).toMatchObject({ text: "Git Bash breaks file:// URLs in Node imports", checked: "the import failed from Git Bash" });
		expect(notes.find((note) => note.id === r1)).toMatchObject({ confirmations: 1, pinned: true });
		expect(notes.find((note) => note.id === r2)?.flagged).toMatchObject({ why: "the gateway tests need Postgres now", agentId: "claude-sonnet" });
		expect(run(first.id).log.at(-1)?.text).toMatch(/^Notes: R1 held, flagged R2 as wrong, noted something about the repository, noted something about this computer$/);
		// A flagged note stays out of the next run's prompt until someone keeps it.
		const second = await store.startRun({ itemId: item(3122).id, stage: "reproduce", agentId: "codex-gpt" });
		expect(Object.values(run(second.id).noteRefs!)).not.toContain(r2);
		store.updateNote("phaseo-app/phaseo", r2, { flagged: false });
		expect(store.get().notes["phaseo-app/phaseo"]!.find((note) => note.id === r2)?.flagged).toBeUndefined();
		store.removeNote("phaseo-app/phaseo", notes[0]!.id);
		expect(store.get().notes["phaseo-app/phaseo"]!.some((note) => note.text.startsWith("Compare page tests"))).toBe(false);
	});

	it("stops Triage on a duplicate, and closing it marks the issue closed", async () => {
		const { store, finish, item, run } = await demoStore();
		const started = await store.startRun({ itemId: item(3117).id, stage: "triage", agentId: "claude-sonnet" });
		finish(started.id, parseReport("Summary: Same as #3122.\nVerdict: Bug\nDuplicate of: #3122"));
		expect(item(3117).stages.triage.status).toBe("needs-you");
		expect(item(3117).duplicateOf).toBe(3122);
		expect(run(started.id).outcome).toEqual({ kind: "success", why: "Found it repeats #3122" });
		await store.act(item(3117).id, { id: "close-duplicate", label: "" });
		expect(item(3117).state).toBe("closed");
		expect(item(3117).stages.triage).toMatchObject({ status: "done", summary: "Closed as a duplicate of #3122." });
	});

	it("counts a fix as flawed when Review of its pull request finds problems", async () => {
		const { store, finish, item, run } = await demoStore();
		const fix = store.get().runs.find((candidate) => candidate.itemId === item(3126).id && candidate.stage === "fix")!;
		store.get().runs.splice(store.get().runs.indexOf(fix), 1, { ...fix, outcome: { kind: "success" } });
		const review = await store.startRun({ itemId: item(3133).id, stage: "review", agentId: "codex-gpt" });
		finish(review.id, parseReport("Summary: Rounds before summing.\nVerdict: Findings\nProof:\n- `pnpm test`: 1 failed\nRisk: high - touches every price"));
		expect(run(review.id).outcome).toEqual({ kind: "success", why: "Found problems: Rounds before summing." });
		expect(run(fix.id).outcome).toEqual({ kind: "flawed", why: "Review found problems: Rounds before summing." });
		expect(run(review.id).report?.risk).toEqual({ level: "high", why: "touches every price" });
	});

	it("hands the next review to another model after fixing findings on someone else's pull request", async () => {
		const { store, finish, item } = await demoStore();
		const pull = item(3128);
		expect(pull.stages.fix.agentId).toBeUndefined();
		await store.act(pull.id, { id: "fix-findings", label: "" });
		const fix = store.get().runs.find((candidate) => candidate.itemId === pull.id && candidate.stage === "fix" && candidate.status === "running")!;
		finish(fix.id, parseReport("Summary: Kept the first item on retry.\nVerdict: Fixed\nProof:\n- `pnpm test`: 12 passed"));
		expect(item(3128).stages.fix).toMatchObject({ status: "done", agentId: fix.agentId });
		expect(item(3128).stages.review.status).toBe("idle");
	});

	it("puts the repositories in the order they were dragged into, for the picker too", async () => {
		const { store } = await demoStore();
		const [first, second] = store.get().settings.repos.map((entry) => entry.repo);
		store.orderRepos([second!, first!]);
		expect(store.get().settings.repos.map((entry) => entry.repo)).toEqual([second, first]);
		expect(store.get().repos.map((status) => status.repo)).toEqual([second, first]);
		// A name it doesn't know changes nothing, and one left out stays at the end.
		store.orderRepos(["someone/else", first!]);
		expect(store.get().settings.repos.map((entry) => entry.repo)).toEqual([first, second]);
	});

	it("comments, closes, reopens, drafts and merges on GitHub, and shows it at once", async () => {
		const { store, item } = await demoStore();
		const issue = item(3117);
		await store.changeOnGithub(issue.id, { kind: "comment", body: "Looking at this now." });
		expect(item(3117).comments).toBe(issue.comments + 1);
		expect(item(3117).updatedAt).toBeGreaterThan(issue.updatedAt);
		await expect(store.changeOnGithub(issue.id, { kind: "comment", body: "   " })).rejects.toThrow("Write a comment first");
		await store.changeOnGithub(issue.id, { kind: "close", reason: "not planned", body: "Can't reproduce." });
		expect(item(3117)).toMatchObject({ state: "closed", comments: issue.comments + 2 });
		await store.changeOnGithub(issue.id, { kind: "reopen" });
		expect(item(3117).state).toBe("open");
		await expect(store.changeOnGithub(issue.id, { kind: "merge", method: "squash" })).rejects.toThrow("Only pull requests can do that");

		const pull = item(3133);
		expect(pull.state).toBe("draft");
		await store.act(pull.id, { id: "mark-ready", label: "" });
		expect(item(3133).state).toBe("open");
		await store.changeOnGithub(pull.id, { kind: "draft", draft: true });
		expect(item(3133).state).toBe("draft");
		await store.changeOnGithub(pull.id, { kind: "draft", draft: false });
		await store.act(pull.id, { id: "merge", label: "" });
		expect(item(3133).state).toBe("merged");
	});

	it("records a stage passed by hand", async () => {
		const { store, finish, item, run } = await demoStore();
		const started = await store.startRun({ itemId: item(3117).id, stage: "triage", agentId: "claude-sonnet" });
		finish(started.id, parseReport("Summary: Can't tell.\nVerdict: Bug\nQuestion: Which page?"));
		expect(run(started.id).outcome?.kind).toBe("blocked");
		await store.act(item(3117).id, { id: "accept", label: "" });
		expect(run(started.id).outcome?.kind).toBe("manual");
		expect(item(3117).stages.triage.status).toBe("done");
	});
});

describe("pull requests from forks", () => {
	const fork = { repo: "someone/phaseo", canPush: true };
	const patchItem = (store: FactoryStore, id: string, patch: (item: WorkItem) => WorkItem) => (store as unknown as { patchItem: (id: string, patch: (item: WorkItem) => WorkItem) => void }).patchItem(id, patch);

	it("won't run an agent that loads a fork's own config on a fork's pull request, and runs any agent on the repository's own", async () => {
		const { store, item } = await demoStore();
		patchItem(store, item(3107).id, (current) => ({ ...current, fork }));
		await expect(store.act(item(3107).id, { id: "run", stage: "review", label: "Run Review", agentId: "codex-gpt" })).rejects.toThrow("Factory can't run Codex on a pull request from a fork: it loads the repository's own Codex settings, which can run code on this computer. Choose Claude, Cursor, Pi, OpenCode or Phaseo for Factory, or review this pull request yourself.");
		expect(store.get().runs.filter((run) => run.itemId === item(3107).id && run.status === "running")).toEqual([]);
		await store.act(item(3107).id, { id: "run", stage: "review", label: "Run Review", agentId: "claude-opus" });
		expect(store.get().runs.find((run) => run.itemId === item(3107).id && run.status === "running")).toMatchObject({ agentId: "claude-opus" });
		const own = await demoStore();
		await own.store.act(own.item(3107).id, { id: "run", stage: "review", label: "Run Review", agentId: "codex-gpt" });
		expect(own.store.get().runs.find((run) => run.itemId === own.item(3107).id && run.status === "running")).toMatchObject({ agentId: "codex-gpt" });
	});

	it.each([[undefined, 1], [fork, 0]] as const)("reads failed checks' logs for Fix CI only on the repository's own pull request (fork: %o)", async (from, reads) => {
		const { store, item } = await demoStore();
		patchItem(store, item(3107).id, (current) => ({ ...current, fork: from, ci: { state: "failed", checkedAt: 0, failed: [{ name: "test", link: "https://github.com/phaseo-app/phaseo/actions/runs/1/job/2" }] }, stages: { ...current.stages, fix: { ...current.stages.fix, agentId: "claude-opus" } } }));
		// Out of demo mode, with no checkouts: the logs are read from GitHub (mocked), then the run fails before any worktree is made.
		Object.assign(store, { demo: false, snapshot: { ...store.get(), settings: { ...store.get().settings, repos: [] } } });
		github.failedLog.mockClear();
		await store.act(item(3107).id, { id: "fix-ci", label: "Fix CI" });
		expect(github.failedLog).toHaveBeenCalledTimes(reads);
		const run = store.get().runs.find((candidate) => candidate.itemId === item(3107).id && candidate.stage === "fix")!;
		expect(run.log.some((line) => line.text.startsWith("Didn't pass on the failed checks' logs: this pull request comes from a fork"))).toBe(!reads);
	});
});

describe("pushing a pull request's fixes", () => {
	it("goes to the fork a pull request came from, and only when its author lets maintainers push", () => {
		expect(pushTarget({})).toBe("origin");
		expect(pushTarget({ fork: { repo: "someone/react", canPush: true } })).toBe("https://github.com/someone/react.git");
		expect(() => assertCanPush({ kind: "pull", fork: { repo: "someone/react", canPush: true } })).not.toThrow();
		expect(() => assertCanPush({ kind: "pull", fork: { repo: "someone/react", canPush: false } })).toThrow(/doesn't let maintainers push/);
		expect(() => assertCanPush({ kind: "pull" })).not.toThrow();
	});
});
