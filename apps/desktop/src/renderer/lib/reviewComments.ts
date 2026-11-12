import { useSyncExternalStore } from "react";

/**
 * Inline review comments made on a diff or file, held until the chat composer sends them as context.
 * The composer listens for these window events (or reads the store) and removes comments once sent.
 */
export const REVIEW_COMMENT_ADDED_EVENT = "phaseo:review-comment-added";
export const REVIEW_COMMENT_REMOVED_EVENT = "phaseo:review-comment-removed";

export type ReviewComment = {
	id: string;
	/** The chat the comment is for, or the project when the surface has no chat. */
	target: string;
	/** Which view it was made in, so the same file in another scope does not show it ("Changes", "Turn 3", "File"). */
	sectionId: string;
	sectionTitle: string;
	filePath: string;
	side: "additions" | "deletions";
	start: number;
	end: number;
	/** "12" or "12-18". */
	rangeLabel: string;
	/** The commented lines, prefixed with +, - or a space for diffs. */
	excerpt: string;
	fenceLanguage: string;
	text: string;
	createdAt: string;
};
export type ReviewCommentAddedDetail = { comment: ReviewComment };
export type ReviewCommentRemovedDetail = { target: string; id: string };

let comments: ReviewComment[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
const EMPTY: ReviewComment[] = [];
const byTarget = new Map<string, { source: ReviewComment[]; value: ReviewComment[] }>();

export function reviewComments(target: string): ReviewComment[] {
	const cached = byTarget.get(target);
	if (cached?.source === comments) return cached.value;
	const value = comments.filter(comment => comment.target === target);
	const result = value.length ? value : EMPTY;
	byTarget.set(target, { source: comments, value: result });
	return result;
}

export function addReviewComment(comment: ReviewComment) {
	comments = [...comments.filter(value => value.id !== comment.id), comment]; emit();
	window.dispatchEvent(new CustomEvent<ReviewCommentAddedDetail>(REVIEW_COMMENT_ADDED_EVENT, { detail: { comment } }));
}

export function removeReviewComment(target: string, id: string) {
	if (!comments.some(value => value.id === id && value.target === target)) return;
	comments = comments.filter(value => !(value.id === id && value.target === target)); emit();
	window.dispatchEvent(new CustomEvent<ReviewCommentRemovedDetail>(REVIEW_COMMENT_REMOVED_EVENT, { detail: { target, id } }));
}

/** For the composer: everything pending for a chat, removed from the store as it is sent. */
export function takeReviewComments(target: string): ReviewComment[] {
	const taken = reviewComments(target);
	if (!taken.length) return [];
	comments = comments.filter(value => value.target !== target); emit();
	return taken;
}

export function useReviewComments(target: string) {
	return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => reviewComments(target));
}

let sequence = 0;
export const nextReviewCommentId = () => `review-${Date.now().toString(36)}-${(sequence++).toString(36)}`;

/** The context block the composer adds to the message for one comment. */
export function formatReviewComment(comment: ReviewComment) {
	const fence = comment.excerpt.includes("```") ? "~~~" : "```";
	return `${comment.sectionTitle}: ${comment.filePath} (lines ${comment.rangeLabel})\n${fence}${comment.fenceLanguage}\n${comment.excerpt}\n${fence}\n${comment.text}`;
}
export const formatReviewComments = (values: readonly ReviewComment[]) => values.map(formatReviewComment).join("\n\n");
export const rangeLabel = (start: number, end: number) => start === end ? String(start) : `${Math.min(start, end)}-${Math.max(start, end)}`;
