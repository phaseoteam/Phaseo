import { useSyncExternalStore } from "react";
import type { PullRequestReviewCommentDraft } from "../../../shared/pullRequestView";

/**
 * A review being written, held until it is sent. Nothing reaches GitHub until the review
 * is submitted with every line comment and the verdict together, so a half-written one is invisible to everyone else.
 * Drafts live per pull request for as long as the app is open: closing a pane or switching tabs keeps them.
 */
export type PendingReviewComment = PullRequestReviewCommentDraft & { id: string };
export type ReviewDraftState = { drafts: Readonly<Record<string, readonly PendingReviewComment[]>>; summaries: Readonly<Record<string, string>>; comments: Readonly<Record<string, string>> };

let sequence = 0;
/** A counter, not the comment's own text: two remarks on one line can match, and discarding one must not take both. */
export function nextPendingReviewCommentId() { sequence += 1; return `pending-review-comment-${sequence}`; }
export const pullRequestReviewKey = (projectId: string, repository: string, number: number) => JSON.stringify([projectId, repository.toLowerCase(), number]);

const EMPTY: readonly PendingReviewComment[] = [];
const without = <T>(record: Readonly<Record<string, T>>, key: string) => { const next = { ...record }; delete next[key]; return next; };

/** The reducer behind the store, pure so it can be tested on its own. */
export const reviewDraftReducers = {
	addComment: (state: ReviewDraftState, key: string, comment: PendingReviewComment): ReviewDraftState => ({ ...state, drafts: { ...state.drafts, [key]: [...(state.drafts[key] ?? EMPTY), comment] } }),
	removeComments: (state: ReviewDraftState, key: string, ids: readonly string[]): ReviewDraftState => {
		const gone = new Set(ids), remaining = (state.drafts[key] ?? EMPTY).filter(entry => !gone.has(entry.id));
		return { ...state, drafts: remaining.length ? { ...state.drafts, [key]: remaining } : without(state.drafts, key) };
	},
	clear: (state: ReviewDraftState, key: string): ReviewDraftState => ({ ...state, drafts: without(state.drafts, key) }),
	setSummary: (state: ReviewDraftState, key: string, body: string): ReviewDraftState => ({ ...state, summaries: body ? { ...state.summaries, [key]: body } : without(state.summaries, key) }),
	/** Only the exact text GitHub accepted goes: a summary revised while the request was out is new work. */
	clearSummary: (state: ReviewDraftState, key: string, submitted: string): ReviewDraftState => state.summaries[key] === submitted ? { ...state, summaries: without(state.summaries, key) } : state,
	setComment: (state: ReviewDraftState, key: string, body: string): ReviewDraftState => ({ ...state, comments: body ? { ...state.comments, [key]: body } : without(state.comments, key) }),
	clearComment: (state: ReviewDraftState, key: string, submitted: string): ReviewDraftState => state.comments[key] === submitted ? { ...state, comments: without(state.comments, key) } : state,
};

let state: ReviewDraftState = { drafts: {}, summaries: {}, comments: {} };
const listeners = new Set<() => void>();
const update = (next: ReviewDraftState) => { if (next === state) return; state = next; for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const reviewDrafts = {
	get: () => state,
	addComment: (key: string, comment: PendingReviewComment) => update(reviewDraftReducers.addComment(state, key, comment)),
	removeComment: (key: string, id: string) => update(reviewDraftReducers.removeComments(state, key, [id])),
	removeComments: (key: string, ids: readonly string[]) => update(reviewDraftReducers.removeComments(state, key, ids)),
	clear: (key: string) => update(reviewDraftReducers.clear(state, key)),
	setSummary: (key: string, body: string) => update(reviewDraftReducers.setSummary(state, key, body)),
	clearSummary: (key: string, submitted: string) => update(reviewDraftReducers.clearSummary(state, key, submitted)),
	setComment: (key: string, body: string) => update(reviewDraftReducers.setComment(state, key, body)),
	clearComment: (key: string, submitted: string) => update(reviewDraftReducers.clearComment(state, key, submitted)),
};

export function useReviewDrafts<T>(select: (value: ReviewDraftState) => T): T { return useSyncExternalStore(subscribe, () => select(state)); }
/** The line comments a pull request's review holds, the same array while it is empty. */
export function usePendingReviewComments(key: string) { return useReviewDrafts(value => value.drafts[key] ?? EMPTY); }
