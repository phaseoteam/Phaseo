import { describe, expect, it } from "vitest";
import { pullRequestSearchQuery, validatePullRequestDirectoryQuery } from "./pullRequestDirectory";

describe("pull request directory requests", () => {
	it("accepts a full request and fills defaults", () => {
		expect(validatePullRequestDirectoryQuery({ state: "open" })).toEqual({ state: "open", text: "", filters: {}, limit: 100 });
		expect(validatePullRequestDirectoryQuery({ state: "all", text: "  wizard ", filters: { labels: [["bug", "size:S"], []], excludedLabels: ["wip"], author: "@octo", draft: "hide", review: "approved", checks: "failing" }, projectId: "p1", limit: 300 }))
			.toEqual({ state: "all", text: "wizard", filters: { labels: [["bug", "size:S"]], excludedLabels: ["wip"], author: "octo", draft: "hide", review: "approved", checks: "failing" }, projectId: "p1", limit: 300 });
	});
	it.each([
		{ state: "draft" }, { state: "open", text: "a\nb" }, { state: "open", limit: 501 }, { state: "open", limit: 0 }, { state: "open", projectId: "" },
		{ state: "open", filters: { author: "a b" } }, { state: "open", filters: { draft: "yes" } }, { state: "open", filters: { review: "lgtm" } },
		{ state: "open", filters: { labels: Array.from({ length: 11 }, () => ["x"]) } }, { state: "open", filters: { excludedLabels: ["x".repeat(201)] } }, null, [],
	])("refuses malformed request %#", value => { expect(() => validatePullRequestDirectoryQuery(value)).toThrow(); });

	it("builds GitHub's search with qualifiers and quoted words", () => {
		expect(pullRequestSearchQuery(["a/b", "c/d"], { state: "closed", text: "fix https://x.test/y \"quoted\"", filters: { labels: [["needs design", "bug"], ["size:S"]], excludedLabels: ["wip"], author: "me", draft: "only", review: "changes-requested", checks: "passing" } }))
			.toBe("is:pr archived:false repo:a/b repo:c/d is:closed is:unmerged label:\"needs design\",bug label:\"size:S\" -label:wip author:@me draft:true review:changes_requested status:success fix \"https://x.test/y\" quoted sort:updated-desc");
		expect(pullRequestSearchQuery(["a/b"], { state: "all", text: "", filters: { review: "review-required", checks: "failing", draft: "hide" } })).toBe("is:pr archived:false repo:a/b draft:false review:required status:failure sort:updated-desc");
	});
});
