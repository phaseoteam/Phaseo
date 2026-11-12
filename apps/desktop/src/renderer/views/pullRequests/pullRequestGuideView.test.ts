import { describe, expect, it } from "vitest";
import type { GuideExcerpt } from "../../../shared/pullRequestGuide";
import { excerptPatch, letterStopNotes, proseTokens, stopFilePaths, stopQuestionPrompt } from "./pullRequestGuideView";

const excerpt: GuideExcerpt = { path: "src/a.ts", side: "new", start: 10, end: 12, caption: "", lines: [{ kind: "context", old: 9, new: 10, text: "keep" }, { kind: "del", old: 10, text: "old" }, { kind: "add", new: 11, text: "new" }, { kind: "add", new: 12, text: "more" }] };

describe("guide view", () => {
	it("turns an excerpt into a one-hunk patch numbered from its own lines", () => {
		expect(excerptPatch(excerpt)).toBe(['diff --git "a/src/a.ts" "b/src/a.ts"', '--- "a/src/a.ts"', '+++ "b/src/a.ts"', "@@ -9,2 +10,3 @@", " keep", "-old", "+new", "+more", ""].join("\n"));
		expect(excerptPatch({ ...excerpt, lines: [] })).toBeUndefined();
		expect(excerptPatch({ ...excerpt, lines: [{ kind: "add", new: 5, text: "x" }] })).toContain("@@ -4,0 +5,1 @@");
	});
	it("letters notes across a stop and finds the ones inside each excerpt", () => {
		const { lettered, byExcerpt } = letterStopNotes({ excerpts: [excerpt], notes: [{ path: "src/a.ts", line: 11, title: "Here", body: "" }, { path: "src/b.ts", line: 1, title: "Elsewhere", body: "" }] });
		expect(lettered.map(note => note.letter)).toEqual(["A", "B"]);
		expect(byExcerpt[0].map(note => note.letter)).toEqual(["A"]);
	});
	it("reads the model's inline markdown and nothing more", () => {
		expect(proseTokens("Call `run()` **once**, not *twice* or 2*3*4.")).toEqual([{ kind: "text", text: "Call " }, { kind: "code", text: "run()" }, { kind: "text", text: " " }, { kind: "strong", text: "once" }, { kind: "text", text: ", not " }, { kind: "em", text: "twice" }, { kind: "text", text: " or 2*3*4." }]);
	});
	it("asks about a stop with its files and the question", () => {
		const stop = { title: "Retry", summary: "", excerpts: [excerpt], files: [{ path: "src/a.ts" }, { path: "src/b.ts" }] };
		expect(stopFilePaths(stop)).toEqual(["src/a.ts", "src/b.ts"]);
		const prompt = stopQuestionPrompt({ number: 4, title: "T", url: "https://github.com/o/r/pull/4", stop, question: " Why? " });
		expect(prompt).toContain('the stop "Retry"');
		expect(prompt).toContain("`src/a.ts`, `src/b.ts`");
		expect(prompt.endsWith("Question: Why?")).toBe(true);
	});
});
