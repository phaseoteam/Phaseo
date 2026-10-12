import { expect, it } from "vitest";
import { richLink } from "./richLink";
import { turnUsage } from "./turnUsage";

it("formats GitHub PRs and issues while rejecting credential-bearing links", () => {
	expect(richLink("https://github.com/team/repo/pull/1162/files")?.label).toBe("PR #1162");
	expect(richLink("https://github.com/team/repo/issues/1128")?.label).toBe("Issue #1128");
	expect(richLink("https://github.com.fake.test/team/repo/pull/1162")?.github).toBe(false);
	expect(richLink("https://user:secret@example.com")).toBeUndefined();
});

it("adds reported step usage across provider formats and tolerates text-only reports", () => {
	expect(turnUsage([
		{ id: "1", type: "usage", title: "Usage", text: '{"input_tokens":10,"output_tokens":3}' },
		{ id: "2", type: "usage", title: "Usage", text: '{"inputTokens":20,"outputTokens":5}' },
		{ id: "3", type: "usage", title: "Usage", text: 'Unavailable' },
	])).toEqual({ Input: 30, Output: 8, Total: 38 });
});
