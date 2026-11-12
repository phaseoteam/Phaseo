import { describe, expect, it } from "vitest";
import { markdownSegments } from "./MarkdownTextarea";

describe("Markdown in text fields", () => {
	it("keeps every character, in order, so the styled copy lines up with the field", () => {
		const text = "# Plan\n> **quoted** and `code`\n\n- [x] done\ntrailing\n";
		expect(markdownSegments(text).map(segment => segment.text).join("")).toBe(text);
	});
	it("gives nested formatting every class that covers it", () => {
		expect(markdownSegments("> a **b**")).toEqual([
			{ text: "> ", className: "composer-md-marker" },
			{ text: "a ", className: "composer-md-quote" },
			{ text: "**", className: "composer-md-quote composer-md-marker" },
			{ text: "b", className: "composer-md-quote composer-md-bold" },
			{ text: "**", className: "composer-md-quote composer-md-marker" },
		]);
	});
	it("leaves plain text as one run", () => {
		expect(markdownSegments("just words\nmore words")).toEqual([{ text: "just words\nmore words" }]);
	});
});
