import { describe, expect, it } from "vitest";
import { nextActions, pullsFor } from "./actions";
import { DEMO_AGENTS, DEMO_SETTINGS, demoConnections, demoItems, demoRepos, demoRuns } from "./demo";
import type { FactorySnapshot } from "./types";

const now = Date.UTC(2026, 9, 22, 12);
const snapshot: FactorySnapshot = { settings: DEMO_SETTINGS, items: demoItems(now), runs: demoRuns(now), agents: DEMO_AGENTS, connections: demoConnections(now), notes: {}, chats: [], loadedAt: now, demo: true, github: { version: "2.99.0", attach: true }, repos: demoRepos(now) };
const actionsFor = (number: number) => nextActions(snapshot.items.find((item) => item.number === number)!, snapshot);
const labels = (number: number) => actionsFor(number).map((action) => action.label);

describe("nextActions", () => {
	it("offers to start an untouched issue, and nothing runs on its own", () => {
		expect(labels(3117)).toEqual(["Run triage", "Autopilot to a pull request"]);
		expect(actionsFor(3117)[1].detail).toBe("Runs Triage, Reproduce and Fix, then opens a draft pull request. Stops as soon as anything needs you");
		expect(actionsFor(3117)[0].primary).toBe(true);
	});

	it("offers to fix review findings, post them or accept them", () => {
		expect(labels(3128)).toEqual(["Fix the findings", "Post the review to GitHub", "Accept and verify"]);
		expect(actionsFor(3128).filter((action) => action.external).map((action) => action.id)).toEqual(["fix-findings", "post-report"]);
	});

	it("lets someone carry on when a bug couldn't be reproduced", () => {
		expect(labels(3122)).toEqual(["Fix anyway", "Ask the reporter"]);
	});

	it("hands a fixed issue over to its pull request, and a verified draft to its author", () => {
		expect(labels(3126)).toEqual(["Open pull request #3133"]);
		expect(labels(3133)).toEqual(["Mark ready for review", "Post the proof to GitHub", "Open issue #3126"]);
		// Out of draft, the next step is merging it, which asks first.
		const ready = { ...snapshot.items.find((item) => item.number === 3133)!, state: "open" as const };
		const merge = nextActions(ready, snapshot).find((action) => action.id === "merge");
		expect(merge).toMatchObject({ label: "Merge pull request", primary: true, external: true, confirm: "Merge #3133?" });
	});

	it("sends an issue that already has an open pull request there, and only runs its stages on request", () => {
		const issue = snapshot.items.find((item) => item.number === 3117)!;
		const pull = { ...snapshot.items.find((item) => item.number === 3133)!, number: 4000, id: `${issue.repo}#4000`, linked: issue.number, state: "open" as const };
		const withPull = { ...snapshot, items: [...snapshot.items, pull] };
		const actions = nextActions({ ...issue, linked: 4000 }, withPull);
		expect(actions.map((action) => action.label)).toEqual(["Open pull request #4000", "Run triage anyway"]);
		expect(actions[0].primary).toBe(true);
		// A closed one doesn't count: the issue is worked on as usual.
		const closed = { ...withPull, items: [...snapshot.items, { ...pull, state: "closed" as const }] };
		expect(nextActions({ ...issue, linked: 4000 }, closed)[0].label).toBe("Run triage");
	});

	it("sends you to the pull request Fix found already fixes the issue", () => {
		const issue = snapshot.items.find((item) => item.number === 3117)!;
		const pull = { ...snapshot.items.find((item) => item.number === 3133)!, number: 4000, id: `${issue.repo}#4000`, state: "open" as const };
		const run = { id: "run-found", itemId: issue.id, stage: "fix" as const, agentId: "claude-sonnet", status: "succeeded" as const, startedAt: now, log: [], report: { verdict: "Not fixed", fixedBy: 4000, notes: [], files: [] } };
		const stages = { ...issue.stages, triage: { status: "done" as const }, reproduce: { status: "done" as const }, fix: { status: "needs-you" as const, runId: run.id } };
		const actions = nextActions({ ...issue, stages }, { ...snapshot, items: [...snapshot.items, pull], runs: [run, ...snapshot.runs] });
		expect(actions.map((action) => action.label)).toEqual(["Open pull request #4000", "Run fix anyway"]);
		expect(actions[0].primary).toBe(true);
	});

	it("finds open pull requests that fix an issue or mention it, the one that fixes it first", () => {
		const issue = snapshot.items.find((item) => item.number === 3117)!;
		const base = snapshot.items.find((item) => item.kind === "pull")!;
		const pull = (number: number, extra: Partial<typeof base>) => ({ ...base, id: `${issue.repo}#${number}`, number, title: "Something", body: "", linked: undefined, state: "open" as const, ...extra });
		const items = [
			pull(1, { body: "Related to #3117" }),
			pull(2, { linked: 3117 }),
			pull(3, { body: "See #31170 and &#3117;" }),
			pull(4, { linked: 3117, state: "merged" }),
			pull(5, { body: "#3117", repo: "other/repo" }),
		];
		expect(pullsFor(issue, items).map((item) => item.number)).toEqual([2, 1]);
	});

	it("doesn't offer to post the same proof twice, or to ship a pull request whose review failed", () => {
		const pull = snapshot.items.find((item) => item.number === 3133)!;
		const verify = snapshot.runs.find((run) => run.id === pull.stages.verify.runId) ?? snapshot.runs.find((run) => run.itemId === pull.id && run.stage === "verify")!;
		const posted = { ...snapshot, runs: snapshot.runs.map((run) => (run.id === verify.id ? { ...run, postedAt: now } : run)) };
		expect(nextActions(pull, posted).map((action) => action.label)).not.toContain("Post the proof to GitHub");
		const reviewFailed = { ...pull, stages: { ...pull.stages, review: { status: "failed" as const } } };
		const labelsAfter = nextActions(reviewFailed, snapshot).map((action) => action.label);
		expect(labelsAfter).not.toContain("Mark ready for review");
		expect(nextActions({ ...reviewFailed, state: "open" }, snapshot).map((action) => action.label)).not.toContain("Merge pull request");
	});

	it("has nothing to press while a stage runs, or once an item is closed", () => {
		expect(actionsFor(3131)).toEqual([]);
		expect(actionsFor(3098)).toEqual([]);
	});
});
