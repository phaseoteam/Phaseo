import { describe, expect, it } from "vitest";
import { badgePresentation } from "./PullRequestBadge";

describe("the chat pull request badge", () => {
	it("shows a stack count, +N for several, or the one pull request's number", () => {
		expect(badgePresentation({ kind: "stack", layers: 3, state: "open" }, undefined)).toMatchObject({ text: "3", label: "Stack of 3 pull requests, open", opensList: true });
		expect(badgePresentation({ kind: "pull-request", others: 2, state: "merged" }, { number: 4, url: "u", state: "merged" })).toMatchObject({ text: "+3", label: "PR #4, merged, and 2 more linked; overall merged", opensList: true });
		expect(badgePresentation({ kind: "pull-request", others: 0, state: "draft" }, { number: 4, url: "u", state: "open", draft: true })).toMatchObject({ text: "4", label: "PR #4, draft", opensList: false });
		expect(badgePresentation(null, { number: 9, url: "u" })).toMatchObject({ text: "9", label: "PR #9, status pending", toneClassName: "text-muted-foreground" });
		expect(badgePresentation(null, undefined)).toBeNull();
	});
});
