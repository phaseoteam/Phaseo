import { FACTORY_BRANCH_PREFIX, instructionsFor } from "./intake";
import { notesRules, notesSection, type PromptNotes } from "./notes";
import type { IssueComment, Playbook, SimilarItem, StageId, StageState, WorkItem } from "./types";

/** What a stage may do: read the code, run commands and save proof, or change files. */
export type StageAccess = "read" | "run" | "write";

export interface StageDefinition {
	id: StageId;
	label: string;
	/** What the stage produces, shown under its name. */
	output: string;
	access: StageAccess;
	/** Stages that must pass first. */
	after: StageId[];
	/** The words the agent picks from to give its verdict. The first one is a pass. */
	verdicts: string[];
}

export const STAGES: StageDefinition[] = [
	{ id: "triage", label: "Triage", output: "Scope and a plan", access: "read", after: [], verdicts: ["Bug", "Feature request", "Needs more information", "Not a bug"] },
	{ id: "reproduce", label: "Reproduce", output: "The bug, shown failing", access: "write", after: ["triage"], verdicts: ["Reproduced", "Could not reproduce"] },
	{ id: "fix", label: "Fix", output: "A fix, shown working", access: "write", after: ["reproduce"], verdicts: ["Fixed", "Not fixed"] },
	{ id: "review", label: "Review", output: "Findings, each shown failing", access: "run", after: ["fix"], verdicts: ["No findings", "Findings"] },
	{ id: "verify", label: "Verify", output: "Before and after", access: "run", after: ["review"], verdicts: ["Passed", "Failed"] },
];

/** Issues get fixed; the fix becomes a pull request, and pull requests get reviewed and verified. */
export const ISSUE_STAGES: StageId[] = ["triage", "reproduce", "fix"];
export const PULL_STAGES: StageId[] = ["review", "verify"];

export function stagesFor(item: Pick<WorkItem, "kind">): StageDefinition[] {
	const ids = item.kind === "pull" ? PULL_STAGES : ISSUE_STAGES;
	return STAGES.filter((stage) => ids.includes(stage.id));
}

export function stageDefinition(id: StageId): StageDefinition {
	return STAGES.find((stage) => stage.id === id) as StageDefinition;
}

export function stageLabel(id: StageId): string {
	return STAGES.find((stage) => stage.id === id)?.label ?? id;
}

export function emptyStages(): Record<StageId, StageState> {
	return { triage: { status: "idle" }, reproduce: { status: "idle" }, fix: { status: "idle" }, review: { status: "idle" }, verify: { status: "idle" } };
}

/** The stage an item is at: the first one that hasn't passed. */
export function currentStage(item: WorkItem): StageDefinition | undefined {
	return stagesFor(item).find((stage) => !["done", "skipped"].includes(item.stages[stage.id].status));
}

/** Where an item sits in the work list. */
export type Lane = "needs-you" | "running" | "queued" | "waiting" | "ready" | "done";

export function laneFor(item: WorkItem): Lane {
	const states = stagesFor(item).map((stage) => item.stages[stage.id].status);
	if (item.state === "merged" || item.state === "closed") return "done";
	if (states.some((status) => status === "needs-you" || status === "failed")) return "needs-you";
	if (states.includes("running")) return "running";
	if (states.includes("queued")) return "queued";
	if (states.includes("waiting")) return "waiting";
	if (states.every((status) => status === "done" || status === "skipped")) return "done";
	return "ready";
}

export const LANES: { id: Lane; label: string }[] = [
	{ id: "needs-you", label: "Needs you" },
	{ id: "running", label: "Running" },
	{ id: "queued", label: "Queued" },
	{ id: "waiting", label: "Waiting on reporter" },
	{ id: "ready", label: "Not started" },
	{ id: "done", label: "Done" },
];

const STAGE_BRIEFS: Record<StageId, string> = {
	triage: [
		"Read the issue and the code it touches. Decide whether it is a real bug, a feature request, not a bug, or too vague to act on.",
		"Name the files involved and quote the lines that cause the problem, with paths and line numbers, so your reading can be checked.",
		"Then give the smallest plan that fixes it. If the report is missing something you need, ask for it. Do not change any files.",
	].join(" "),
	reproduce: [
		"Show the problem happening before anything is fixed. Write the smallest automated test that fails because of this issue, next to the code it covers, run it and save its output.",
		"If the problem shows in a user interface, also follow the report's steps the way a user would and save a screenshot of the broken screen, or a short recording when it takes several steps.",
		"Do not fix the bug. If you can't make it fail, say so and show what you tried: that is a useful result, not one to hide.",
	].join(" "),
	fix: [
		"Fix the issue with the smallest change that makes the failing test from Reproduce pass without breaking others.",
		"Then prove the problem is gone the way it showed: repeat what Reproduce did and capture the same thing after your change, beside the before. The same screen as a screenshot, the same timing measured again, the same input's output.",
		"Run that test, the suites around the change, lint and typecheck too, and save their output to back it up.",
		"If the issue has a Done when list, prove each point on it.",
		"Commit on the current branch with a short scoped message. Don't push or open a pull request: Factory does that with your proof.",
	].join(" "),
	review: [
		"Review the change on this branch against its base for correctness bugs, regressions and missing tests.",
		"For each finding give the file, the line and a concrete input that breaks it. Run it when you can and save the output as proof. Leave out anything you can't show failing.",
		"Most severe first. If there is nothing, say so with the verdict No findings.",
		"Then rate how risky the change is to merge, by how much could go wrong if it's wrong and how well the tests cover that: low for a small change whose effect is easy to see and is tested; medium when it touches code many callers share, or its tests leave gaps; high only when a mistake could lose data, charge the wrong amount or open a security hole and the tests don't rule that out. Touching money or data isn't high on its own if the change is small and tested. Do not change any files.",
	].join(" "),
	verify: [
		"Check that this branch does what the issue or pull request asks for, the way the person who reported it would.",
		"Use the change for real: start the app or call the code, follow the steps from the report, and capture what you see.",
		"Show before and after: the same steps on the base branch and on this branch, captured the same way, so the difference is plain to someone who doesn't read the code.",
		"Run the tests and builds that cover the change too, and save their output to back it up.",
		"If the issue has a Done when list, go through it point by point and give each one its own proof, or say plainly which ones fail. Do not change any files outside the proof folder.",
	].join(" "),
};

/** The brief a stage gives its agent: the playbook's own wording, or the default. */
export function stageBrief(stage: StageId, playbook?: Playbook): string {
	return playbook?.briefs[stage]?.trim() || STAGE_BRIEFS[stage];
}

export function defaultBrief(stage: StageId): string {
	return STAGE_BRIEFS[stage];
}

/** Stages that can ask the reporter for what's missing before trying again. */
export const ASKS_REPORTER: StageId[] = ["triage", "reproduce"];

/** Where a run saves its proof, relative to the worktree. Git ignores it. */
export const PROOF_FOLDER = ".factory/proof";

/** What proof is for, by stage: showing the result happen, not that commands ran. */
const PROOF_MEANS: Record<StageId, string> = {
	triage: "",
	reproduce: "Proof shows the problem happening, the way the reporter saw it. This is the before half: Fix captures the same thing after.",
	fix: "Proof shows the problem gone: the same thing captured before and after your change, side by side.",
	review: "Proof shows each finding failing: the input, and what goes wrong with it. With no findings, say what you checked.",
	verify: "Proof shows the change doing what was asked: the same thing captured before and after, side by side.",
};

/** The part of every prompt that asks for proof and a report Factory can read. It isn't editable. */
export function reportRules(stage: StageId, proofDir: string, options: { duplicates?: boolean; notes?: boolean } = {}): string {
	const { verdicts, access } = stageDefinition(stage);
	// A read-only stage can't run anything, so asking it for saved output only makes it ask for permission.
	const proof = access === "read"
		? [
			"Proof",
			"This stage only reads: you can't run commands or write files, and you don't need to. Your proof is the code you quote, with paths and line numbers.",
			"The next stage runs the code and saves its output, so don't ask for permission to run anything.",
		]
		: [
			"Proof",
			PROOF_MEANS[stage],
			"Pick whatever shows it best for this change:",
			"- Something on screen: a screenshot of the same screen each way, or a short recording when it takes several steps.",
			"- Speed or size: measure it each way, a few times, and give the numbers, for example \"before: 840 ms, after: 95 ms (median of 5)\".",
			"- Output, data or an API: the same input each way, with both outputs saved.",
			"- An error or crash: the error happening, then the same steps going through.",
			"\"Before\" is the code without this change. To run it, check the base out into a folder inside the proof folder with git worktree add, and remove it with git worktree remove when you're done. Don't switch this branch.",
			"Test, lint and build output backs proof up, but on its own it isn't proof. Don't save the diff: Factory already has it.",
			"",
			`Save the files in ${proofDir}. It already exists, and git ignores it:`,
			"- Screenshots as .png, recordings as .webm or .mp4, measurements and command output as UTF-8 .txt or .log. In PowerShell, write text with Out-File -Encoding utf8, because > writes UTF-16.",
			"- Name each file for what it shows, with before- and after- for the two sides, for example before-usage-page.png and after-usage-page.png.",
			"- Never say something works without proof. If you couldn't check something, say that instead.",
		];
	return [
		...proof,
		"",
		"End your reply with this report, each line on its own:",
		"Summary: one line on what you found or changed.",
		`Verdict: one of ${verdicts.slice(0, -1).join(", ")} or ${verdicts.at(-1)}.`,
		"Proof:",
		"- file-name.png: what it shows",
		"- `the command you ran`: what it printed, for example \"12 passed, 0 failed\"",
		...(stage === "review" ? ["Risk: low, medium or high, then a dash and why, for example \"Risk: medium - changes how every price is rounded\"."] : []),
		...(stage === "triage" && options.duplicates ? ["If this issue is the same problem as one listed above, add a line \"Duplicate of: #number\". Only when it really is the same problem, not just a similar area."] : []),
		"If you need an answer from a person before you can go on, add a last line that starts with \"Question:\" and stop there.",
		...(ASKS_REPORTER.includes(stage) ? [
			"",
			"If you're missing something only the person who reported this can tell you, such as the exact steps, their version, browser or operating system, the data they used, or a screenshot of what they saw, add this after Proof:",
			"Ask the reporter:",
			"- one short question per thing you need, written to them, saying why it matters",
			"Factory posts these on the issue, so only ask what would change your result.",
		] : []),
		...notesRules(Boolean(options.notes)),
	].join("\n");
}

/** Text an issue that reads like this one leads with, cut short: enough to tell whether it's the same problem. */
function similarLines(similar: SimilarItem[], bodies: Map<string, string>): string[] {
	return similar.flatMap((entry) => {
		const body = (bodies.get(entry.id) ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
		return [`- #${entry.number} (${entry.state}): ${entry.title}`, ...(body ? [`  ${body}`] : [])];
	});
}

/**
 * Review and Verify judge the change on its own, without the reasoning of the agent that wrote it:
 * the description of a pull request Factory opened is the fixer's own account, so it's left out.
 */
export function judgesAlone(item: WorkItem, stage: StageId): boolean {
	return item.kind === "pull" && (stage === "review" || stage === "verify") && Boolean(item.branch?.startsWith(FACTORY_BRANCH_PREFIX));
}

const DONE_WHEN = "Done when";

/** An issue written in Factory: what's wrong, then the checklist its proof has to cover. */
export function issueBody(body: string, doneWhen: string, images: { name: string; ref?: string }[] = []): string {
	const points = doneWhen.split("\n").map((line) => line.trim().replace(/^[-*]\s*(\[[ x]\]\s*)?/, "")).filter(Boolean);
	// Images with a ref go up with gh --attach, which swaps the local path for the uploaded link.
	const shown = images.filter((image) => image.ref);
	const kept = images.filter((image) => !image.ref).map((image) => image.name);
	return [
		body.trim() || "_No description._",
		...shown.flatMap((image) => ["", `![${image.name}](${image.ref})`]),
		...(kept.length ? ["", `${kept.length === 1 ? "1 image" : `${kept.length} images`} attached in Phaseo Factory: ${kept.join(", ")}.`] : []),
		...(points.length ? ["", `## ${DONE_WHEN}`, "", ...points.map((point) => `- [ ] ${point}`)] : []),
		"",
		"<sub>Logged in Phaseo Factory.</sub>",
	].join("\n");
}

/** What each issue stage does about a pull request that's already open for the issue. */
const OPEN_PULL_STEER: Partial<Record<StageId, string>> = {
	triage: "Judge the issue as usual, and say in your summary whether that pull request looks like it fixes it, from what it says.",
	reproduce: "Reproducing is still useful: it shows whether that pull request is needed and gives it a test to pass.",
	fix: "Read it first, for example with gh pr diff and the number. If it fixes the issue, don't change anything: show that it does, give the verdict Not fixed and add a line \"Already fixed by: #number\". Only write a fix if it doesn't, and say what it misses.",
};

/** Open pull requests that already point at the issue, so no stage starts a second fix. */
function openPullLines(pulls: WorkItem[], issue: WorkItem, stage: StageId): string[] {
	if (!pulls.length) {
		// Factory only sees this repository's open pull requests, so Fix still looks before it starts.
		return stage === "fix" ? ["", `Before you start, check for an open pull request that already fixes this, for example with gh pr list --state open --search "${issue.number}". If there is one and it fixes the issue, don't write a second fix: give the verdict Not fixed and add a line "Already fixed by: #number".`] : [];
	}
	return [
		"",
		"These open pull requests already point at this issue:",
		...pulls.flatMap((pull) => {
			const body = pull.body.replace(/\s+/g, " ").trim().slice(0, 300);
			const how = pull.linked === issue.number || issue.linked === pull.number ? "says it fixes this issue" : "mentions this issue";
			return [`- #${pull.number}: ${pull.title} (${pull.state === "draft" ? "draft, " : ""}by @${pull.author.login}, branch ${pull.branch ?? "unknown"}; ${how})`, ...(body ? [`  ${body}`] : [])];
		}),
		"Someone is already working on this. Don't open another pull request, and don't push.",
		...(OPEN_PULL_STEER[stage] ? [OPEN_PULL_STEER[stage]] : []),
	];
}

/** The prompt sent to the agent for one stage of one item. A pull request brings the issue it fixes, so Review and Verify check against what was asked. */
export function stagePrompt(item: WorkItem, stage: StageId, playbook?: Playbook, options: { proofDir?: string; brief?: string; fixes?: WorkItem; inputs?: string[]; replies?: IssueComment[]; notes?: PromptNotes; similar?: SimilarItem[]; similarBodies?: Map<string, string>; uncommitted?: string[]; pulls?: WorkItem[] } = {}): string {
	const kind = item.kind === "pull" ? "pull request" : "issue";
	const instructions = playbook && instructionsFor(item, playbook);
	const notes = options.notes ?? { repo: [], computer: [] };
	const hasNotes = notes.repo.length + notes.computer.length > 0;
	const similar = stage === "triage" ? (options.similar ?? []) : [];
	const alone = judgesAlone(item, stage);
	return [
		...(instructions ? [`Instructions for every ${kind} in this repository:`, instructions, ""] : []),
		...notesSection(notes),
		`You are working on ${item.repo} ${kind} #${item.number}: ${item.title}`,
		"",
		alone ? `(The pull request's description is left out on purpose. Judge the change on its diff against ${options.fixes ? "the issue below" : "its base"}, not on what its author says it does.)` : item.body.trim() || "(no description)",
		...(options.fixes ? ["", `It fixes issue #${options.fixes.number}: ${options.fixes.title}`, "", options.fixes.body.trim() || "(no description)"] : []),
		...(similar.length ? ["", "Other issues in this repository that may be about the same thing, closest first. Some only share words:", ...similarLines(similar, options.similarBodies ?? new Map())] : []),
		...(item.kind === "issue" ? openPullLines(options.pulls ?? [], item, stage) : []),
		...(options.uncommitted?.length ? [
			"",
			"This worktree already has uncommitted changes from earlier runs on this item. Earlier stages leave their work uncommitted on purpose (Reproduce's failing test, for example), but a run that was stopped or failed may have left half-done changes too. Look at them before you start:",
			...options.uncommitted.slice(0, 30).map((file) => `- ${file}`),
			...(options.uncommitted.length > 30 ? [`- and ${options.uncommitted.length - 30} more`] : []),
		] : []),
		...(options.inputs?.length ? ["", "The person who wrote the issue attached these images. Open each one before you start:", ...options.inputs.map((file) => `- ${file}`)] : []),
		...(options.replies?.length ? ["", "Factory asked the reporter for more details on GitHub. Their replies, oldest first:", ...options.replies.flatMap((reply) => ["", `@${reply.author}:`, reply.body.trim()])] : []),
		"",
		`Stage: ${stageLabel(stage)}.`,
		options.brief ?? stageBrief(stage, playbook),
		"",
		reportRules(stage, options.proofDir ?? `${PROOF_FOLDER}/<run>`, { duplicates: similar.length > 0, notes: hasNotes }),
	].join("\n");
}

/** What a reply to a finished run says, so the agent carries on in the same conversation. */
export function replyPrompt(message: string, stage: StageId, proofDir: string): string {
	return [
		message.trim(),
		"",
		`(Carry on with ${stageLabel(stage)}. Save any new proof in ${proofDir}, and end with the same report: Summary, Verdict, Proof, and a Question if you need one.)`,
	].join("\n");
}

/** The brief for fixing review findings on a pull request's branch, in place of Fix's own. */
export function findingsBrief(findings: string): string {
	return [
		"A review of this branch found the problems below. Fix each one, or explain why it isn't a problem, and prove each fix with a test or command output.",
		"Commit each fix on the current branch. Don't push: Factory does that.",
		"",
		"Review findings:",
		findings.trim(),
	].join("\n");
}

/** How much of each failed check's log goes into the brief. The end is where the error usually is. */
const CI_LOG_LINES = 150;

/** The brief for making a pull request's failing GitHub checks pass, in place of Fix's own. */
/** What a Fix run is asked to do when a pull request conflicts with its base branch. */
export function conflictBrief(base: string): string {
	return [
		`This pull request conflicts with \`${base}\`, so GitHub can't merge it. Bring \`${base}\` into this branch and resolve every conflict.`,
		`Run \`git fetch origin ${base}\`, then \`git merge origin/${base}\`. Don't rebase, and don't rewrite or force-push this branch: people may have it checked out.`,
		"For each conflict, keep what both sides meant: this branch's change, and whatever changed on the base since. Don't just take one side. If two changes really can't both stand, keep the base's and say so.",
		"Then run the tests and build, and save their output as proof that the merged code works. Commit the merge on the current branch. Don't push: Factory does that.",
		"Give the verdict Fixed once the merge is committed and the tests pass. List each file that conflicted and how you resolved it.",
	].join("\n");
}

export function ciBrief(failed: { name: string; link?: string; log?: string }[]): string {
	return [
		"GitHub's checks failed on this branch. Find out why each one failed, fix the cause, and run the same commands locally to show they pass now. Save their output as proof.",
		"If a check fails for a reason that has nothing to do with this change, such as a flaky test or an outage, say so with proof instead of changing code.",
		"Commit each fix on the current branch. Don't push: Factory does that.",
		"",
		"Failed checks:",
		...failed.flatMap((check) => [
			"",
			`${check.name}${check.link ? ` (${check.link})` : ""}`,
			...(check.log ? ["Last lines of its log:", "```", check.log.split("\n").slice(-CI_LOG_LINES).join("\n"), "```"] : []),
		]),
	].join("\n");
}
