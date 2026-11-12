import { describe, expect, it } from "vitest";
import { pullRequestMatches } from "./composerPullRequests";

const request = (number: number, title: string, updatedAt = "2026-10-01T00:00:00Z") => ({ number, title, head: `branch-${number}`, author: "a", updatedAt });
describe("the pull requests # offers", () => {
	it("matches numbers by prefix and words by title or branch, linked and exact first", () => {
		const requests = [request(12, "Fix build", "2026-10-03T00:00:00Z"), request(1, "Docs"), request(123, "Fix tests", "2026-10-02T00:00:00Z"), request(12, "Duplicate")];
		expect(pullRequestMatches(requests, "12").map(value => value.number)).toEqual([12, 123]);
		expect(pullRequestMatches(requests, "fix").map(value => value.number)).toEqual([12, 123]);
		expect(pullRequestMatches(requests, "branch-1").map(value => value.number)).toEqual([12, 123, 1]);
		expect(pullRequestMatches(requests, "", [1]).map(value => value.number)).toEqual([1, 12, 123]);
	});
});
