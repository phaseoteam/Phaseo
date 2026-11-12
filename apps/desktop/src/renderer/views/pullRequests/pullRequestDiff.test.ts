import { describe, expect, it } from "vitest";
import type { PullRequestReviewThreadView } from "../../../shared/pullRequestView";
import { agentSelectionPrompt, hunkRanges, lineInPatch, patchExcerpt, placeThreads, rangeLabel, rangeToDraft } from "./pullRequestDiff";

const patch = "@@ -10,3 +10,4 @@ fn\n context\n-old\n+new\n+added\n context\n@@ -40 +41,0 @@\n-gone";
const thread = (id: string, path: string, patchValues: Partial<PullRequestReviewThreadView> = {}): PullRequestReviewThreadView => ({ id, path, side: "RIGHT", resolved: false, outdated: false, canReply: true, canResolve: true, canUnresolve: false, comments: [], totalComments: 0, ...patchValues });

describe("diff helpers", () => {
	it("reads hunk ranges, including a one-line and an empty run", () => {
		expect(hunkRanges(patch)).toEqual([{ oldStart: 10, oldEnd: 12, newStart: 10, newEnd: 13 }, { oldStart: 40, oldEnd: 40, newStart: 41, newEnd: 40 }]);
		expect(lineInPatch(patch, "RIGHT", 13)).toBe(true);
		expect(lineInPatch(patch, "RIGHT", 41)).toBe(false);
		expect(lineInPatch(patch, "LEFT", 40)).toBe(true);
		expect(lineInPatch(undefined, "LEFT", 1)).toBe(false);
	});
	it("pins threads to lines on the diff and strands the rest, outdated ones included", () => {
		const patches = new Map([["a.ts", patch], ["b.ts", undefined]]);
		const threads = [thread("on", "a.ts", { line: 11 }), thread("off", "a.ts", { line: 30 }), thread("old", "a.ts", { line: 11, outdated: true }), thread("noline", "a.ts", { originalLine: 3 }), thread("later", "c.ts", { line: 1 })];
		const partial = placeThreads(threads, patches, false);
		expect(partial.anchored.get("a.ts")?.map(value => value.id)).toEqual(["on"]);
		expect(partial.offDiff.map(value => value.id)).toEqual(["off", "old", "noline"]);
		expect(placeThreads(threads, patches, true).offDiff.map(value => value.id)).toEqual(["off", "old", "noline", "later"]);
	});
	it("turns a selection into GitHub's line comment, putting upward and cross-side drags right", () => {
		expect(rangeToDraft("a.ts", { start: 12, end: 12, side: "additions" })).toEqual({ path: "a.ts", line: 12, side: "RIGHT" });
		expect(rangeToDraft("a.ts", { start: 13, end: 10, side: "additions" })).toEqual({ path: "a.ts", line: 13, side: "RIGHT", startLine: 10, startSide: "RIGHT" });
		expect(rangeToDraft("a.ts", { start: 11, side: "deletions", end: 12, endSide: "additions" })).toEqual({ path: "a.ts", line: 12, side: "RIGHT", startLine: 11, startSide: "LEFT" });
		expect(rangeToDraft("a.ts", { start: 12, side: "additions", end: 11, endSide: "deletions" })).toEqual({ path: "a.ts", line: 12, side: "RIGHT", startLine: 11, startSide: "LEFT" });
		expect(rangeLabel("a.ts", { line: 13, startLine: 10 })).toBe("a.ts:10–13");
	});
	it("quotes the marked lines of one side for the agent", () => {
		expect(patchExcerpt(patch, "RIGHT", 11, 12)).toEqual(["+new", "+added"]);
		expect(patchExcerpt(patch, "LEFT", 11, 11)).toEqual(["-old"]);
		expect(agentSelectionPrompt({ number: 4, path: "a.ts", draft: { path: "a.ts", line: 12, side: "RIGHT", startLine: 11, startSide: "RIGHT" }, lines: ["+new"], request: " Why? " })).toBe("About PR #4, a.ts:11–12:\n```diff\n+new\n```\nWhy?");
	});
});
