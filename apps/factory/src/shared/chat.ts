import { notesSection, type PromptNotes } from "./notes";
import { stagesFor } from "./stages";
import type { ChatMessage, IssueComment, Run, WorkItem } from "./types";

/** The newest comments go in, up to this many, so a long thread doesn't crowd out the question. */
const COMMENTS_IN_PROMPT = 15;

/**
 * A chat's first message: what Factory knows about the item, so the agent can talk about it straight
 * away, and the rules (read, don't change). Later messages go in as they are, on the same session.
 */
export function chatPrompt(input: {
	item: WorkItem;
	body: string;
	runs: Run[];
	linked?: WorkItem;
	notes?: PromptNotes;
	branch?: string;
	/** The item's comments on GitHub, oldest first. */
	comments?: IssueComment[];
	/** Earlier messages, when the chat moves to an agent that wasn't in it. */
	history?: ChatMessage[];
	message: string;
}): string {
	const { item, body, runs, linked } = input;
	const kind = item.kind === "pull" ? "pull request" : "issue";
	const stages = stagesFor(item).map((stage) => {
		const state = item.stages[stage.id];
		const run = runs.find((candidate) => candidate.id === state.runId) ?? runs.find((candidate) => candidate.itemId === item.id && candidate.stage === stage.id);
		const verdict = run?.report?.verdict ? ` (${run.report.verdict})` : "";
		return `- ${stage.label}: ${state.status}${verdict}${state.summary ? `. ${state.summary.replace(/\s+/g, " ").slice(0, 400)}` : ""}`;
	});
	const history = (input.history ?? []).filter((entry) => entry.role === "you" || entry.role === "agent");
	// Bots' comments are status noise; Factory's own say what was asked and found, so they stay.
	const comments = (input.comments ?? []).filter((comment) => !comment.author.endsWith("[bot]")).slice(-COMMENTS_IN_PROMPT);
	const skipped = (input.comments ?? []).filter((comment) => !comment.author.endsWith("[bot]")).length - comments.length;
	return [
		`You're chatting with someone in Phaseo Factory about ${item.repo} ${kind} #${item.number}. They may ask about it, about the code, or about anything else: answer what they ask.`,
		input.branch
			? `The current folder is a checkout of ${input.branch}. Read the code to answer when it helps, but don't change any files: this is a conversation, not a run.`
			: "There's no checkout of this repository on this computer, so answer from what's below.",
		"Answer in Markdown. Be direct and keep it short unless they ask for detail.",
		"",
		...notesSection(input.notes ?? { repo: [], computer: [] }),
		`${kind === "issue" ? "Issue" : "Pull request"} #${item.number}: ${item.title}`,
		`State: ${item.state}. Opened by @${item.author.login}.${item.labels.length ? ` Labels: ${item.labels.join(", ")}.` : ""}${item.diff ? ` Changes: ${item.diff.files} files, +${item.diff.additions} −${item.diff.deletions}.` : ""}${item.ci ? ` GitHub checks: ${item.ci.state}.` : ""}`,
		"",
		body.trim().slice(0, 6_000) || "(no description)",
		...(linked ? ["", `${linked.kind === "pull" ? "Its pull request" : "It fixes issue"} #${linked.number}: ${linked.title}`] : []),
		...(comments.length ? [
			"",
			`Comments on GitHub, oldest first${skipped > 0 ? ` (the ${skipped} before these are left out)` : ""}:`,
			...comments.flatMap((comment) => ["", `@${comment.author}${comment.factory ? " (posted by Factory)" : ""}:`, comment.body.trim().slice(0, 2_000)]),
		] : []),
		"",
		"Where Factory's stages are:",
		...stages,
		...(history.length ? ["", "The conversation so far, with another agent:", ...history.map((entry) => `${entry.role === "you" ? "Them" : "Agent"}: ${entry.text.slice(0, 2_000)}`)] : []),
		"",
		"Their message:",
		input.message,
	].join("\n");
}

/** Shown in place of an agent in demo mode. */
export function demoChatReply(item: WorkItem, message: string): string {
	return `This is demo data, so no agent ran. On real work, the item's agent reads ${item.kind === "pull" ? "the pull request's branch" : "the code"} and answers here.\n\nYou asked: _${message.slice(0, 200)}_`;
}


