import type { LogLine, Run } from "./types";

/**
 * What happens on GitHub while a stage runs, passed on to its agent. Reviews, comments and failed checks reach the
 * agent at its next step, so it doesn't finish on code someone has already found a problem with. Only people who can
 * push to the repository, and the review bots named here, direct agents: anyone can comment on a public repository,
 * so everyone else's comments are held back and only noted in the run's log.
 */

/** Something new on an issue or pull request: a comment, a review, a comment on a line, or failed checks. */
export interface GithubActivity {
	/** Unique across kinds, so nothing is passed on twice. */
	id: string;
	kind: "comment" | "review" | "line" | "checks";
	author: string;
	/** GitHub's author_association: OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE… */
	association?: string;
	bot?: boolean;
	body: string;
	at: number;
	/** A review's verdict: APPROVED, CHANGES_REQUESTED or COMMENTED. */
	state?: string;
	path?: string;
	line?: number;
	url?: string;
	/** Which item it's on, when the run works on more than one (an issue and its pull request). */
	number?: number;
}

/**
 * Review bots whose comments go to agents until you choose your own (Settings → Factory → Checking for new work).
 * Other bots are left out: most post status, not findings, and a workflow's bot can repeat text from whoever opened
 * the pull request.
 */
export const TRUSTED_BOTS = ["chatgpt-codex-connector[bot]", "copilot-pull-request-reviewer[bot]", "coderabbitai[bot]"];

/** Bot logins as typed in Settings: separated by commas, spaces or lines, with "[bot]" added where it was left off. */
export function parseBots(text: string): string[] {
	const bots = text.split(/[\s,]+/).map((entry) => entry.trim().replace(/^@/, "")).filter(Boolean).map((entry) => (entry.endsWith("[bot]") ? entry : `${entry}[bot]`));
	return [...new Set(bots)];
}

const WRITE_ACCESS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** Whether an agent should act on it: GitHub's own checks, people who can push here, and the review bots above. */
export function trustedActivity(activity: GithubActivity, bots: readonly string[] = TRUSTED_BOTS): boolean {
	if (activity.kind === "checks") return true;
	if (activity.bot || activity.author.endsWith("[bot]")) return bots.some((bot) => bot.toLowerCase() === activity.author.toLowerCase());
	return WRITE_ACCESS.has((activity.association ?? "").toUpperCase());
}

/** The new activity a run hasn't heard yet, split into what goes to the agent and what's held back. */
export function sortActivity(activity: GithubActivity[], heard: readonly string[], bots: readonly string[] = TRUSTED_BOTS) {
	const fresh = activity.filter((entry) => !heard.includes(entry.id)).sort((a, b) => a.at - b.at);
	return { pass: fresh.filter((entry) => trustedActivity(entry, bots)), hold: fresh.filter((entry) => !trustedActivity(entry, bots)) };
}

/** How much of a failed check's log goes to the agent. The end is where the error usually is. */
const CHECK_LOG_LINES = 80;
const MAX_BODY = 4_000;

function describe(entry: GithubActivity, several: boolean): string {
	const on = several && entry.number ? ` on #${entry.number}` : "";
	if (entry.kind === "checks") return [`GitHub checks failed${on}:`, entry.body].join("\n");
	const body = entry.body.trim().slice(0, MAX_BODY);
	if (entry.kind === "line") return `@${entry.author} commented${on} on ${entry.path}${entry.line ? `:${entry.line}` : ""}:\n${body}`;
	if (entry.kind === "review") {
		const verdict = entry.state === "APPROVED" ? "approved" : entry.state === "CHANGES_REQUESTED" ? "requested changes" : "reviewed";
		return `@${entry.author} ${verdict}${on}${body ? `:\n${body}` : "."}`;
	}
	return `@${entry.author} commented${on}:\n${body}`;
}

/** The message that brings new activity to the agent, mid-turn where its harness allows. */
export function activityMessage(activity: GithubActivity[]): string {
	const several = new Set(activity.map((entry) => entry.number).filter(Boolean)).size > 1;
	return [
		`New on GitHub since you started (from Phaseo Factory). Take it into account if it bears on what you're doing; you don't need to reply to it. Your stage, its rules and its report stay the same.`,
		...activity.flatMap((entry) => ["", "---", describe(entry, several)]),
	].join("\n");
}

/** Failed checks as one piece of activity, with the end of each log that could be read. */
export function checksActivity(head: string, failed: { name: string; link?: string; log?: string }[], at: number, number?: number): GithubActivity {
	const body = failed.map((check) => [
		`${check.name}${check.link ? ` (${check.link})` : ""}`,
		...(check.log ? ["```", check.log.split("\n").slice(-CHECK_LOG_LINES).join("\n"), "```"] : []),
	].join("\n")).join("\n\n");
	return { id: `checks:${head}:${failed.map((check) => check.name).join(",")}`, kind: "checks", author: "github", body, at, number };
}

/** Said in the run's log for what was held back, one line per person. */
export function heldBackLine(hold: GithubActivity[]): string | undefined {
	if (!hold.length) return undefined;
	const people = [...new Set(hold.map((entry) => `@${entry.author}`))];
	return `Didn't pass on ${hold.length === 1 ? "a comment" : `${hold.length} comments`} from ${people.join(", ")}: only people who can push to the repository, and the review bots in Settings, direct agents`;
}

/**
 * Stalls. A run that shows nothing for a long time is usually waiting on something that never ends: a test runner in
 * watch mode, a dev server, a command asking for input. Factory first tells the agent so it can stop that and carry on;
 * if nothing happens after that either, the run is stopped and left for a person.
 */
export const STALL_AFTER = 30 * 60_000;
/** How long the agent has, after being told, to show it's moving again. */
export const STALL_GRACE = 15 * 60_000;

/** The quiet spell before the nudge, as said in the nudge and the run's log. */
export const STALL_WAIT = `${Math.round(STALL_AFTER / 60_000)} minutes`;

export const STALL_NUDGE = `Phaseo Factory: nothing has happened in this run for ${STALL_WAIT}. If you're waiting on a command that won't finish on its own (a watch mode, a dev server, a prompt for input), stop it and carry on without it. If you're still making progress, say so in one line and keep going.`;

/** Factory's own lines and messages from people aren't the agent doing anything. */
const progressLine = (line: LogLine) => line.kind !== "info" && line.kind !== "you";

/**
 * When the agent last did something: its last tool call, answer or error in the log, or the run's start. `movedAt` is
 * when its thread last showed it at work (a tool starting, an answer growing), which the log only has once finished.
 */
export function lastProgress(run: Pick<Run, "startedAt" | "log">, movedAt = 0): number {
	return Math.max(run.log.findLast(progressLine)?.at ?? run.startedAt, movedAt);
}

/** What to do about a run that may have stalled: tell the agent, stop it, or nothing yet. */
export function stallAction(run: Pick<Run, "startedAt" | "log" | "nudgedAt">, now: number, movedAt = 0): "nudge" | "stop" | undefined {
	const progress = lastProgress(run, movedAt);
	// Told already, and nothing since: past the grace period it stops.
	if (run.nudgedAt && run.nudgedAt >= progress) return now - run.nudgedAt >= STALL_GRACE ? "stop" : undefined;
	return now - progress >= STALL_AFTER ? "nudge" : undefined;
}

/** Why a stalled run was stopped, with the last thing it did. */
export function stallSummary(run: Pick<Run, "startedAt" | "log">, now: number, movedAt = 0): string {
	const minutes = Math.round((now - lastProgress(run, movedAt)) / 60_000);
	const last = run.log.findLast(progressLine)?.text.split("\n")[0]?.slice(0, 160);
	return `Stalled: nothing happened for ${minutes} minutes, even after Factory told the agent, so it was stopped.${last ? ` Last: ${last}` : ""}`;
}
