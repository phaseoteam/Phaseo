import { describe, expect, it } from "vitest";
import type { TaskPullRequestLink } from "./pullRequestView";
import { currentPullRequest, isStackedBase, parsePullRequestStacks, pullRequestBadge, pullRequestChains, pullRequestListLines, stackActionLayers, stackHeadsMatch, stackMembership, validatePullRequestStackAction, validateSavedStack, type PullRequestStack } from "./pullRequestStacks";

const sha = (digit: string) => digit.repeat(40);
const link = (number: number, head: string, base: string, patch: Partial<TaskPullRequestLink> = {}, state: "open" | "closed" | "merged" = "open"): TaskPullRequestLink => ({
	repository: "owned/repo", number, url: `https://github.com/owned/repo/pull/${number}`, linkedAt: `2026-10-0${number % 9 + 1}T00:00:00Z`, source: "manual",
	snapshot: { title: `#${number}`, state, draft: false, mergeable: "MERGEABLE", checks: "passing", review: "none", additions: 1, deletions: 1, author: "a", head, base, updatedAt: `2026-10-1${number % 9}T00:00:00Z` }, ...patch,
});
const stack: PullRequestStack = { id: "9", number: 3, url: "https://github.com/owned/repo/stacks/3", base: "main", layers: [
	{ number: 1, headBranch: "one", state: "merged", headSha: sha("1") },
	{ number: 2, headBranch: "two", state: "open", headSha: sha("2") },
	{ number: 4, headBranch: "four", state: "open", headSha: sha("4"), draft: true },
] };

describe("reading native stacks", () => {
	it("reads GitHub's stacks preview, with base as a ref or a name, and an empty listing as no stack", () => {
		expect(parsePullRequestStacks([])).toBeNull();
		expect(parsePullRequestStacks([{ id: 9, number: 3, url: "https://api.github.com/x", html_url: "https://github.com/owned/repo/stacks/3", base: { ref: "main" }, pull_requests: [
			{ number: 1, title: "One", draft: false, head: { ref: "one", sha: sha("A") }, state: "closed", merged_at: "2026-10-01T00:00:00Z" },
			{ number: 2, head: { ref: "two" }, state: "open" },
		] }])).toEqual({ id: "9", number: 3, url: "https://github.com/owned/repo/stacks/3", base: "main", layers: [
			{ number: 1, headBranch: "one", state: "merged", title: "One", draft: false, headSha: sha("a") },
			{ number: 2, headBranch: "two", state: "open" },
		] });
		expect(parsePullRequestStacks({ number: 3, node_id: "S_1", url: "u", base: "main", pull_requests: [] })?.id).toBe("S_1");
		expect(() => parsePullRequestStacks([{ number: 3, url: "u", base: "main", pull_requests: [{ number: 0, head: { ref: "x" } }] }])).toThrow();
		expect(validateSavedStack({ ...stack, layers: [{ number: 1, headBranch: "one", state: "weird" }] })).toBeUndefined();
		expect(stackMembership(stack, 2)).toEqual({ number: 3, position: 2, size: 3, base: "main" });
	});
	it("plans merges through a layer and rebases from the top, refusing drafts and unknown heads", () => {
		expect(stackActionLayers(stack, 2, "merge")).toMatchObject({ reason: undefined, layers: [expect.objectContaining({ number: 2 })] });
		expect(stackActionLayers(stack, 4, "merge").reason).toBe("Every layer being merged must be open and ready for review.");
		expect(stackActionLayers(stack, 4, "rebase")).toMatchObject({ reason: undefined, layers: [expect.objectContaining({ number: 2 }), expect.objectContaining({ number: 4 })] });
		expect(stackActionLayers({ ...stack, layers: stack.layers.map(layer => ({ ...layer, headSha: undefined })) }, 2, "merge").reason).toBe("Refresh the stack before acting on it.");
		expect(stackActionLayers(stack, 99, "merge").reason).toBe("This pull request is no longer in the stack.");
		expect(stackHeadsMatch(stack.layers.slice(1), [{ number: 2, headSha: sha("2") }, { number: 4, headSha: sha("4") }])).toBe(true);
		expect(stackHeadsMatch(stack.layers.slice(1), [{ number: 2, headSha: sha("2") }, { number: 4, headSha: sha("5") }])).toBe(false);
	});
	it("validates stack actions", () => {
		expect(validatePullRequestStackAction({ number: 2, stackNumber: 3, action: "merge", method: "squash", expectedHeads: [{ number: 2, headSha: sha("A") }] })).toEqual({ number: 2, stackNumber: 3, action: "merge", method: "squash", expectedHeads: [{ number: 2, headSha: sha("a") }] });
		expect(validatePullRequestStackAction({ number: 4, stackNumber: 3, action: "rebase", method: "squash", expectedHeads: [{ number: 4, headSha: sha("4") }] })).not.toHaveProperty("method");
		for (const value of [{ number: 2, stackNumber: 3, action: "merge", expectedHeads: [{ number: 2, headSha: sha("a") }] }, { number: 2, stackNumber: 3, action: "close", expectedHeads: [] }, { number: 2, stackNumber: 3, action: "rebase", expectedHeads: [{ number: 2, headSha: "x" }] }, { number: 2, stackNumber: 3, action: "rebase", expectedHeads: [{ number: 2, headSha: sha("a") }, { number: 2, headSha: sha("b") }] }])
			expect(() => validatePullRequestStackAction(value)).toThrow();
	});
});

describe("chains of linked pull requests", () => {
	it("chains by base branch, bottom to top, and leaves ambiguous heads and cycles unchained", () => {
		const chains = pullRequestChains([link(3, "c", "b"), link(1, "a", "main"), link(2, "b", "a"), link(5, "e", "main")]);
		expect(chains.map(chain => chain.layers.map(value => value.number))).toEqual([[1, 2, 3], [5]]);
		expect(pullRequestChains([link(1, "a", "main"), link(2, "a", "main"), link(3, "c", "a")]).map(chain => chain.layers.map(value => value.number))).toEqual([[1], [2], [3]]);
		expect(pullRequestChains([link(1, "a", "b"), link(2, "b", "a")]).flatMap(chain => chain.layers.map(value => value.number)).sort()).toEqual([1, 2]);
		// Another repository's branch of the same name is not a parent.
		expect(pullRequestChains([link(1, "a", "main"), link(2, "b", "a", { repository: "other/repo" })])).toHaveLength(2);
	});
	it("puts native stacks first in the host's order and hides dismissed layers", () => {
		const saved = { id: "9", number: 3, url: "u", base: "main", layers: [{ number: 4, headBranch: "x", state: "open" as const }, { number: 2, headBranch: "y", state: "open" as const }] };
		const chains = pullRequestChains([link(2, "y", "x", { stack: saved }), link(4, "x", "main", { stack: saved }), link(6, "z", "main", { source: "stack-dismissed" })]);
		expect(chains).toEqual([{ kind: "native", layers: [expect.objectContaining({ number: 4 }), expect.objectContaining({ number: 2 })] }]);
	});
	it("indents layers under the newest chain and names the stack on its bottom row", () => {
		const lines = pullRequestListLines(pullRequestChains([link(1, "a", "main"), link(2, "b", "a"), link(8, "h", "main")]));
		expect(lines.map(line => [line.link.number, line.depth, line.stack])).toEqual([[8, 0, null], [1, 0, { kind: "derived", size: 2 }], [2, 1, null]]);
	});
	it("reduces a chat's links to one badge and one current pull request", () => {
		expect(pullRequestBadge([])).toBeNull();
		expect(pullRequestBadge([link(1, "a", "main"), link(2, "b", "a")])).toEqual({ kind: "stack", layers: 2, state: "open" });
		expect(pullRequestBadge([link(1, "a", "main"), link(5, "e", "main", {}, "merged")])).toEqual({ kind: "pull-request", others: 1, state: "open" });
		expect(pullRequestBadge([link(1, "a", "main", {}, "merged"), link(5, "e", "main", {}, "merged")])).toMatchObject({ state: "merged" });
		expect(pullRequestBadge([link(1, "a", "main", {}, "merged"), link(5, "e", "main", {}, "closed")])).toMatchObject({ state: "closed" });
		expect(currentPullRequest([link(1, "a", "main"), link(2, "b", "a")])?.number).toBe(2);
		expect(currentPullRequest([link(1, "a", "main", {}, "merged"), link(5, "e", "main")])?.number).toBe(5);
		expect(currentPullRequest([link(1, "a", "main", {}, "merged"), link(2, "b", "a", {}, "merged")])?.number).toBe(2);
	});
	it("reads a base other than the default branch as stacked", () => {
		expect(isStackedBase("feature", "main")).toBe(true);
		expect(isStackedBase("main", "main")).toBe(false);
		expect(isStackedBase("feature", undefined)).toBe(false);
	});
});
