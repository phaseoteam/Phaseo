import { describe, expect, it } from "vitest";
import { canSubmitReview, reviewPlaceholder } from "./Composer";
import { actionFailureLabel, actionSuccessLabel, readableFailure } from "./pullRequestFeedback";
import { nextPendingReviewCommentId, pullRequestReviewKey, reviewDraftReducers, reviewDrafts, type ReviewDraftState } from "./pullRequestReviewStore";

const empty: ReviewDraftState = { drafts: {}, summaries: {}, comments: {} };
const draft = (id: string) => ({ id, path: "src/a.ts", line: 3, side: "RIGHT" as const, body: "Nit" });

describe("review drafts", () => {
	it("keys a pull request by project, repository (any case) and number", () => {
		expect(pullRequestReviewKey("p", "Owner/Repo", 4)).toBe(pullRequestReviewKey("p", "owner/repo", 4));
		expect(pullRequestReviewKey("p", "owner/repo", 4)).not.toBe(pullRequestReviewKey("q", "owner/repo", 4));
	});
	it("hands out ids that never repeat, even for identical remarks", () => { expect(nextPendingReviewCommentId()).not.toBe(nextPendingReviewCommentId()); });
	it("adds, removes and clears line comments per pull request", () => {
		let state = reviewDraftReducers.addComment(empty, "a", draft("1"));
		state = reviewDraftReducers.addComment(state, "a", draft("2"));
		state = reviewDraftReducers.addComment(state, "b", draft("3"));
		expect(state.drafts.a.map(entry => entry.id)).toEqual(["1", "2"]);
		state = reviewDraftReducers.removeComments(state, "a", ["1"]);
		expect(state.drafts.a.map(entry => entry.id)).toEqual(["2"]);
		state = reviewDraftReducers.removeComments(state, "a", ["2"]);
		expect("a" in state.drafts).toBe(false);
		expect(reviewDraftReducers.clear(state, "b").drafts).toEqual({});
	});
	it("only clears the summary GitHub accepted, keeping one revised in flight", () => {
		const state = reviewDraftReducers.setSummary(empty, "a", "Looks good");
		expect(reviewDraftReducers.clearSummary(state, "a", "Looks good").summaries).toEqual({});
		expect(reviewDraftReducers.clearSummary(state, "a", "Looks")).toBe(state);
		expect(reviewDraftReducers.setSummary(state, "a", "").summaries).toEqual({});
	});
	it("keeps the comment draft beside the review and survives as module state", () => {
		reviewDrafts.setComment("k", "Draft");
		expect(reviewDrafts.get().comments.k).toBe("Draft");
		reviewDrafts.clearComment("k", "Draft");
		expect(reviewDrafts.get().comments.k).toBeUndefined();
	});
});

describe("composer rules", () => {
	it("asks for words with a change request and for words or line comments with a comment review", () => {
		expect(canSubmitReview("approve", "", 0)).toBe(true);
		expect(canSubmitReview("request-changes", "", 3)).toBe(false);
		expect(canSubmitReview("comment", "", 0)).toBe(false);
		expect(canSubmitReview("comment", "", 1)).toBe(true);
		expect(reviewPlaceholder("request-changes", 0)).toBe("Summarise your review (required to request changes)");
		expect(reviewPlaceholder("comment", 0)).toBe("Summarise your review or add line comments");
		expect(reviewPlaceholder("comment", 2)).toBe("Summarise your review (optional)");
	});
});

describe("action feedback", () => {
	it("says what happened, or what did not", () => {
		expect(actionSuccessLabel({ type: "merge", method: "squash" })).toBe("Merge requested");
		expect(actionSuccessLabel({ type: "review", event: "approve", body: "" })).toBe("Pull request approved");
		expect(actionSuccessLabel({ type: "comment", body: "x", then: "close" })).toBe("Commented and closed");
		expect(actionSuccessLabel({ type: "react", subjectId: "x", content: "HEART", reacted: true })).toBeUndefined();
		expect(actionFailureLabel({ type: "revert" })).toBe("Could not open a revert pull request");
	});
	it("prefers GitHub's own words, then our message, then the hint", () => {
		expect(readableFailure("Could not merge. GitHub said: Base branch was modified (HTTP 409)", { type: "merge", method: "merge" })).toBe("Base branch was modified (HTTP 409)");
		expect(readableFailure("Could not merge.", { type: "merge", method: "merge" })).toMatch(/^GitHub refused the merge/);
		expect(readableFailure("This pull request changed. It has been refreshed; check it and try again.", { type: "close" })).toBe("This pull request changed. It has been refreshed; check it and try again.");
		expect(readableFailure("gh command failed", { type: "close" })).toMatch(/^GitHub refused it/);
		expect(readableFailure("x".repeat(400), { type: "comment", body: "y" })).toHaveLength(320);
	});
});
