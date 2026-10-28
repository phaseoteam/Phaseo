import { FACTORY_BRANCH_PREFIX, agentForStage, stageAgentIsFixed } from "./intake";
import { ASK_ROUNDS, asksReporter, hasProof, verdictPassed } from "./report";
import { currentStage, stagesFor } from "./stages";
import type { FactorySnapshot, ItemAction, Run, StageId, WorkItem } from "./types";

/** The buttons that move an item along from where it is now, most useful first. */

export function lastRun(item: WorkItem, stage: StageId, runs: Run[]): Run | undefined {
	const state = item.stages[stage];
	return runs.find((run) => run.id === state.runId) ?? runs.find((run) => run.itemId === item.id && run.stage === stage);
}

/** The pull request Factory opened for an issue, or the issue a pull request fixes. */
export function linkedItem(item: WorkItem, items: WorkItem[]): WorkItem | undefined {
	if (!item.linked) return undefined;
	return items.find((candidate) => candidate.repo === item.repo && candidate.number === item.linked && candidate.kind !== item.kind);
}

/** Open pull requests in the same repository that fix an issue or mention it by number, the linked one first. */
export function pullsFor(issue: WorkItem, items: WorkItem[]): WorkItem[] {
	if (issue.kind !== "issue") return [];
	const mention = new RegExp(`(^|[^\\w&/])#${issue.number}\\b`);
	return items
		.filter((pull) => pull.kind === "pull" && pull.repo === issue.repo && (pull.state === "open" || pull.state === "draft"))
		.filter((pull) => pull.linked === issue.number || issue.linked === pull.number || mention.test(`${pull.title}\n${pull.body}`))
		.sort((a, b) => Number(b.number === issue.linked || b.linked === issue.number) - Number(a.number === issue.linked || a.linked === issue.number));
}

/** A model on a different harness from the one that just failed, for a second opinion. */
function otherAgent(snapshot: FactorySnapshot, agentId: string | undefined) {
	const harness = snapshot.agents.find((agent) => agent.id === agentId)?.harness;
	return snapshot.agents.find((agent) => agent.harness !== harness && agent.harness !== "phaseo");
}

export function nextActions(item: WorkItem, snapshot: FactorySnapshot): ItemAction[] {
	if (item.state === "merged" || item.state === "closed") return [];
	const playbook = snapshot.settings.playbooks[item.kind];
	const linked = linkedItem(item, snapshot.items);
	const stage = currentStage(item);
	const state = stage && item.stages[stage.id];
	const run = stage && lastRun(item, stage.id, snapshot.runs);
	const report = run?.report;
	const actions: ItemAction[] = [];
	const goTo = (target: WorkItem): ItemAction => ({ id: "go-to", target: target.id, label: target.kind === "pull" ? `Open pull request #${target.number}` : `Open issue #${target.number}` });
	// An issue someone already has a pull request for is worked on there, not fixed a second time.
	const openPull = item.kind === "issue" && linked && (linked.state === "open" || linked.state === "draft") ? linked : undefined;

	if (item.kind === "issue") {
		if (!stage) {
			if (linked) return [{ ...goTo(linked), primary: true, detail: "Review and Verify run there" }];
			return [{ id: "open-pull", primary: true, external: true, label: "Open a draft pull request", detail: `Pushes ${item.branch ?? "the fix branch"} with the proof in the description` }];
		}
	}

	if (stage && state) {
		const label = stage.label.toLowerCase();
		if (state.status === "idle") {
			const blocked = stage.after.some((previous) => stagesFor(item).some((candidate) => candidate.id === previous) && !["done", "skipped"].includes(item.stages[previous].status));
			const ci = item.kind === "pull" ? item.ci : undefined;
			if (ci?.state === "failed") actions.push(fixChecks(item, ci.failed.length));
			if (openPull) actions.push({ ...goTo(openPull), primary: true, detail: `It already fixes this issue: Review and Verify run there` });
			if (!blocked) actions.push({ id: "run", stage: stage.id, primary: !openPull, label: openPull ? `Run ${label} anyway` : `Run ${label}`, detail: openPull ? `Pull request #${openPull.number} already fixes this` : stage.id === "verify" && ci?.state === "pending" ? "GitHub's checks are still running: Verify means more once they pass" : stage.output });
			if (!blocked && !openPull && autopilotFits(item)) actions.push(autopilot(item));
		}

		if (state.status === "waiting") {
			actions.push({ id: "open-on-github", primary: true, label: "See the question on GitHub", detail: "Run it again once they answer" });
			actions.push({ id: "run", stage: stage.id, label: `Run ${label} now`, detail: "Without waiting for an answer" });
			actions.push({ id: "stop-waiting", label: "Stop waiting", detail: "Leaves it to you" });
		}

		if (state.status === "needs-you" || state.status === "failed") {
			const findings = item.kind === "pull" && (stage.id === "review" || stage.id === "verify") && report && !verdictPassed(stage.id, report.verdict);
			if (stage.id === "fix" && report?.fixedBy) {
				const pull = snapshot.items.find((candidate) => candidate.repo === item.repo && candidate.number === report.fixedBy && candidate.kind === "pull");
				if (pull) actions.push({ ...goTo(pull), primary: true, detail: "Fix found it already fixes this issue" });
				actions.push({ id: "run", stage: stage.id, primary: !pull, label: "Run fix anyway", detail: "Writes a fix of its own" });
			} else if (stage.id === "triage" && report?.duplicateOf) {
				const original = snapshot.items.find((candidate) => candidate.repo === item.repo && candidate.number === report.duplicateOf && candidate.kind === "issue");
				actions.push({ id: "close-duplicate", primary: true, external: true, label: `Close as a duplicate of #${report.duplicateOf}`, detail: "Says so in a comment and closes the issue" });
				actions.push({ id: "accept", label: "Not a duplicate", detail: "Marks Triage passed" });
				if (original) actions.push(goTo(original));
			} else if (findings) {
				actions.push({ id: "fix-findings", primary: true, external: !item.branch?.startsWith("factory/"), label: stage.id === "review" ? "Fix the findings" : "Fix what Verify found", detail: `Commits on ${item.branch ?? "the branch"}, pushes, then reviews again` });
				if (!run?.postedAt) actions.push({ id: "post-report", external: true, label: `Post the ${label} to GitHub`, detail: "As a comment, with the proof" });
				if (stage.id === "review") actions.push({ id: "accept", label: "Accept and verify", detail: "The findings don't block this" });
			} else if (item.kind === "issue" && asksReporter(stage.id, report)) {
				const asked = item.asked?.rounds ?? 0;
				actions.push({ id: "ask-reporter", primary: true, external: true, label: "Ask the reporter", detail: asked >= ASK_ROUNDS ? `Asked ${asked} times already; this asks once more` : `Posts ${report.ask.length === 1 ? "the one thing" : `the ${report.ask.length} things`} ${stage.label} needs on the issue, then waits for an answer` });
				actions.push({ id: "accept", label: stage.id === "triage" ? "Reproduce anyway" : "Fix anyway", detail: `Marks ${stage.label} passed` });
				actions.push({ id: "run", stage: stage.id, label: `Run ${label} again` });
			} else if (report?.question) {
				actions.push({ id: "accept", label: "Carry on without an answer", detail: `Marks ${stage.label} passed` });
			} else if (report && !hasProof(report) && state.status === "needs-you") {
				actions.push({ id: "run", stage: stage.id, primary: true, label: `Run ${label} again`, detail: "And ask for proof this time" });
				actions.push({ id: "accept", label: "Accept without proof", detail: `Marks ${stage.label} passed` });
			} else if (stage.id === "triage" && report) {
				if (!run?.postedAt) actions.push({ id: "post-report", primary: true, external: true, label: "Post triage to GitHub", detail: report.verdict === "Needs more information" ? "Asks the reporter for what's missing" : "So the reporter sees it" });
				actions.push({ id: "accept", label: "Reproduce anyway", detail: "Marks Triage passed" });
			} else if (stage.id === "reproduce" && report) {
				actions.push({ id: "accept", primary: true, label: "Fix anyway", detail: "Skips the failing test" });
				actions.push({ id: "post-report", external: true, label: "Ask the reporter", detail: "Posts what was tried as a comment" });
			} else {
				actions.push({ id: "run", stage: stage.id, primary: true, label: `Run ${label} again` });
				const other = otherAgent(snapshot, state.agentId);
				if (other) actions.push({ id: "run", stage: stage.id, agentId: other.id, label: `Try ${other.label}`, detail: "A second opinion from another model" });
				if (stage.id === "review") actions.push({ id: "accept", label: "Accept and verify" });
			}
		}
	}

	if (item.kind === "pull") {
		const verified = item.stages.verify.status === "done";
		// Ready means both stages passed: a Verify that ran after a failed Review doesn't make up for it.
		const passed = verified && item.stages.review.status === "done";
		if (verified && item.ci?.state === "failed") actions.push(fixChecks(item, item.ci.failed.length));
		if (passed && item.state === "draft") actions.push({ id: "mark-ready", primary: true, external: true, label: "Mark ready for review", detail: "Takes the pull request out of draft" });
		if (verified) {
			const verify = lastRun(item, "verify", snapshot.runs);
			if (verify?.report && !playbook.postReports && !verify.postedAt) actions.push({ id: "post-report", external: true, label: "Post the proof to GitHub", detail: "Verify's screenshots and results, as a comment" });
			if (passed && item.state !== "draft") actions.push({ id: "merge", primary: true, external: true, label: "Merge pull request", detail: "Merges the way GitHub offers you first; the Activity tab has the other ways", confirm: `Merge #${item.number}?` });
		}
	}
	if (linked && !actions.some((action) => action.id === "go-to" && action.target === linked.id)) actions.push(goTo(linked));
	// Only one button leads.
	let led = false;
	return actions.map((action) => {
		const primary = Boolean(action.primary) && !led;
		led ||= primary;
		return { ...action, primary };
	});
}

/** An issue Autopilot can take on: its next stage is ready to start, and it has no pull request of its own yet. */
export function autopilotFits(item: WorkItem): boolean {
	const stage = currentStage(item);
	return item.kind === "issue" && !item.autopilot && !item.linked && item.state === "open" && Boolean(stage) && item.stages[stage!.id].status === "idle";
}

export function autopilot(item: WorkItem): ItemAction {
	const left = stagesFor(item).filter((stage) => !["done", "skipped"].includes(item.stages[stage.id].status)).map((stage) => stage.label);
	const list = left.length > 1 ? `${left.slice(0, -1).join(", ")} and ${left.at(-1)}` : left[0];
	return { id: "autopilot", external: true, label: "Autopilot to a pull request", detail: `Runs ${list}, then opens a draft pull request. Stops as soon as anything needs you` };
}

function fixChecks(item: WorkItem, count: number): ItemAction {
	return { id: "fix-ci", primary: true, external: !item.branch?.startsWith(FACTORY_BRANCH_PREFIX), label: count === 1 ? "Fix the failing check" : "Fix the failing checks", detail: `Reads ${count === 1 ? "its log" : "their logs"}, commits on ${item.branch ?? "the branch"} and pushes` };
}

/**
 * Who runs a stage. With independent review on, Review goes to a model on a different harness from the
 * one that wrote the fix, unless the playbook names Review's agent on purpose.
 */
export function stageAgent(item: WorkItem, stage: StageId, snapshot: FactorySnapshot): string | undefined {
	const playbook = snapshot.settings.playbooks[item.kind];
	const chosen = item.stages[stage].agentId ?? agentForStage(item, stage, playbook);
	const author = item.stages.fix.agentId;
	if (stage !== "review" || !author || !snapshot.settings.independentReview || stageAgentIsFixed(item, "review", playbook)) return chosen;
	const harness = snapshot.agents.find((agent) => agent.id === author)?.harness;
	const independent = (agentId: string | undefined) => snapshot.agents.some((agent) => agent.id === agentId && agent.id !== author && agent.harness !== harness);
	if (independent(chosen)) return chosen;
	return snapshot.agents.find((agent) => independent(agent.id))?.id ?? chosen;
}

/** The agent a run action would use, so its button can say so. */
export function actionAgent(item: WorkItem, action: ItemAction, snapshot: FactorySnapshot): string | undefined {
	if (action.agentId) return action.agentId;
	if (action.id === "fix-ci" || action.id === "fix-findings") return item.stages.fix.agentId ?? agentForStage(item, "fix", snapshot.settings.playbooks[item.kind]);
	if (!action.stage) return undefined;
	return stageAgent(item, action.stage, snapshot);
}
