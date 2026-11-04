import { describe, expect, it } from "vitest";
import { markdownRanges, type KnownCommand } from "./composerMarkdown";

/** Each styled run as "class:text", per line, so expectations read like the draft. */
const styled = (lines: string[], known: KnownCommand[] = []) => markdownRanges(lines, known).map(range => `${range.className.replace("composer-md-", "")}:${lines[range.line]!.slice(range.from, range.to)}`);

describe("live Markdown in the composer", () => {
	it("styles inline formatting and keeps its markers as faded text", () => {
		expect(styled(["Make **this** bold, *that* italic, ~~gone~~ and `code`."])).toEqual(["marker:`", "code:code", "marker:`", "marker:**", "bold:this", "marker:**", "marker:~~", "strike:gone", "marker:~~", "marker:*", "italic:that", "marker:*"]);
		expect(styled(["__strong__ and _soft_"])).toEqual(["marker:__", "bold:strong", "marker:__", "marker:_", "italic:soft", "marker:_"]);
		expect(styled(["See [the docs](https://phaseo.app/docs)"])).toEqual(["marker:[", "link:the docs", "marker:](https://phaseo.app/docs)"]);
	});
	it("leaves text that only looks like formatting alone", () => {
		expect(styled(["it costs $5 * 3 * 2, see snake_case_name and 2*3*4"])).toEqual([]);
		expect(styled(["`**not bold**` stays code"])).toEqual(["marker:`", "code:**not bold**", "marker:`"]);
		expect(styled(["**unclosed"])).toEqual([]);
	});
	it("styles headings, quotes, lists and tasks", () => {
		expect(styled(["# Title", "## Part **two**", "> quoted", "- item", "12. step", "- [x] done"])).toEqual([
			"marker:# ", "h1:Title", "marker:## ", "h2:Part **two**", "marker:**", "bold:two", "marker:**",
			"marker:> ", "quote:quoted", "list:-", "list:12.", "list:-", "task-done:[x]",
		]);
		expect(styled(["* bullet *not italic"])).toEqual(["list:*"]);
	});
	it("keeps code fences literal until they close", () => {
		expect(styled(["```ts", "const a = **b**;", "```", "**after**"])).toEqual(["fence:```ts", "code-block:const a = **b**;", "fence:```", "marker:**", "bold:after", "marker:**"]);
		expect(styled(["```inline```"])).toEqual(["marker:```", "code:inline", "marker:```"]);
	});
	it("formats around chips, which are one character", () => {
		expect(styled(["**Use ￼ now**"])).toEqual(["marker:**", "bold:Use ￼ now", "marker:**"]);
	});
	it("shows a known command or skill at the start of the message as a chip", () => {
		const known: KnownCommand[] = [{ name: "skill:frontend-design", kind: "skill" }, { name: "review", kind: "command" }];
		expect(styled(["/skill:frontend-design fix the **header**"], known)).toEqual(["skill:/skill:frontend-design", "marker:**", "bold:header", "marker:**"]);
		expect(styled(["/review"], known)).toEqual(["command:/review"]);
		expect(styled(["/unknown thing", "/review"], known)).toEqual([]);
	});
});


describe("escaping in the composer", () => {
	it("keeps a backslashed character literal and fades the backslash", () => {
		expect(styled(["\\*not italic\\* but *this*"])).toEqual(["escape:\\", "escape:\\", "marker:*", "italic:this", "marker:*"]);
		expect(styled(["\\**still not bold**"])).toEqual(["escape:\\"]);
		expect(styled(["`a \\* b`"])).toEqual(["marker:`", "code:a \\* b", "marker:`"]);
	});
});
