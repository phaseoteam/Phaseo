import { describe, expect, it } from "vitest";
import { resolvePullRequestMergeMethod } from "./mergeMethod";

describe("merge method", () => {
	it("prefers the choice made here, then the default, then the last one picked, within what the repository allows", () => {
		expect(resolvePullRequestMergeMethod(["merge", "squash", "rebase"], "rebase", "merge", "squash")).toBe("rebase");
		expect(resolvePullRequestMergeMethod(["merge", "squash", "rebase"], null, "merge", "squash")).toBe("merge");
		expect(resolvePullRequestMergeMethod(["merge", "squash"], null, "rebase", "squash")).toBe("squash");
		expect(resolvePullRequestMergeMethod(["rebase"], null, null, "squash")).toBe("rebase");
		expect(resolvePullRequestMergeMethod([], null, null, "squash")).toBe("merge");
	});
});
