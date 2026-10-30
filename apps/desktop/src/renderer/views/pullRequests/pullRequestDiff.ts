import type { SelectedLineRange } from "@pierre/diffs";
import type { PullRequestReviewCommentDraft, PullRequestReviewThreadView } from "../../../shared/pullRequestView";

type Side = "LEFT" | "RIGHT";
export type HunkRange = { oldStart: number; oldEnd: number; newStart: number; newEnd: number };

/** Each hunk's run of old and new lines, read from its `@@` header. An empty run (`,0`) covers nothing. */
export function hunkRanges(patch: string | undefined): HunkRange[] {
	return [...(patch ?? "").matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map(match => {
		const oldStart = Number(match[1]), oldCount = match[2] === undefined ? 1 : Number(match[2]), newStart = Number(match[3]), newCount = match[4] === undefined ? 1 : Number(match[4]);
		return { oldStart, oldEnd: oldStart + oldCount - 1, newStart, newEnd: newStart + newCount - 1 };
	});
}
/** Whether the diff draws this line at all: a line outside every hunk has no row to be pinned to. */
export function lineInPatch(patch: string | undefined, side: Side, line: number) {
	return hunkRanges(patch).some(range => side === "LEFT" ? line >= range.oldStart && line <= range.oldEnd : line >= range.newStart && line <= range.newEnd);
}

/**
 * Where each conversation is drawn: under its line when the diff on screen has that line, otherwise in "Conversations
 * not on the current diff". A thread GitHub marked outdated has no current line, so it never pins to its old one.
 * Threads whose file is not loaded yet wait until every page is in (`complete`) before being called stranded.
 */
export function placeThreads(threads: readonly PullRequestReviewThreadView[], patches: ReadonlyMap<string, string | undefined>, complete: boolean) {
	const anchored = new Map<string, PullRequestReviewThreadView[]>(), offDiff: PullRequestReviewThreadView[] = [];
	for (const thread of threads) {
		if (!patches.has(thread.path)) { if (complete) offDiff.push(thread); continue; }
		if (thread.line !== undefined && !thread.outdated && lineInPatch(patches.get(thread.path), thread.side, thread.line)) anchored.set(thread.path, [...(anchored.get(thread.path) ?? []), thread]);
		else offDiff.push(thread);
	}
	return { anchored, offDiff };
}

const toSide = (side: SelectedLineRange["side"]): Side => side === "deletions" ? "LEFT" : "RIGHT";
/** A dragged selection as GitHub's line comment: the last line carries it, the first makes it a range. Upward drags are put right. */
export function rangeToDraft(path: string, range: SelectedLineRange): Omit<PullRequestReviewCommentDraft, "body"> {
	let startSide = toSide(range.side), side = toSide(range.endSide ?? range.side), start = range.start, end = range.end;
	if (startSide === side && start > end) [start, end] = [end, start];
	// GitHub wants a range that crosses sides to run from the old side to the new one.
	if (startSide === "RIGHT" && side === "LEFT") { [start, end] = [end, start]; [startSide, side] = [side, startSide]; }
	return { path, line: end, side, ...(start !== end || startSide !== side ? { startLine: start, startSide } : {}) };
}
export function rangeLabel(path: string, draft: Pick<PullRequestReviewCommentDraft, "line" | "startLine">) { return draft.startLine && draft.startLine !== draft.line ? `${path}:${draft.startLine}–${draft.line}` : `${path}:${draft.line}`; }

/** The patch's own text for a range of one side, for handing marked lines to the agent. */
export function patchExcerpt(patch: string | undefined, side: Side, start: number, end: number): string[] {
	const lines: string[] = [];
	let oldLine = 0, newLine = 0;
	for (const line of (patch ?? "").split("\n")) {
		const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (header) { oldLine = Number(header[1]); newLine = Number(header[2]); continue; }
		if (!oldLine && !newLine) continue;
		const mark = line[0];
		if (mark === "\\") continue;
		const number = mark === "-" ? oldLine : newLine;
		const inSide = side === "LEFT" ? mark !== "+" : mark !== "-";
		if (inSide && number >= start && number <= end) lines.push(line);
		if (mark !== "+") oldLine++;
		if (mark !== "-") newLine++;
	}
	return lines;
}
/** Marked lines and the reader's request, in the shape the agent reads: where, the lines, then what to do. */
export function agentSelectionPrompt(input: { number: number; path: string; draft: Omit<PullRequestReviewCommentDraft, "body">; lines: string[]; request: string }) {
	return [`About PR #${input.number}, ${rangeLabel(input.path, input.draft)}:`, "```diff", ...input.lines, "```", input.request.trim()].filter(Boolean).join("\n");
}
