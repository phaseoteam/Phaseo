import assert from "node:assert/strict";
import { test } from "node:test";
import { splitDetails } from "../src/markdownDetails.ts";

const fence = "```";

test("text without details is one part", () => {
	assert.deepEqual(splitDetails("Hello **world**"), [{ kind: "markdown", text: "Hello **world**" }]);
	assert.deepEqual(splitDetails(""), []);
});

test("splits a GitHub-style block with its summary", () => {
	const parts = splitDetails("Before\n\n<details>\n<summary>Full <b>log</b> &amp; trace</summary>\n\n- one\n- two\n\n</details>\n\nAfter");
	assert.deepEqual(parts, [
		{ kind: "markdown", text: "Before\n" },
		{ kind: "details", summary: "Full log & trace", open: false, complete: true, parts: [{ kind: "markdown", text: "\n- one\n- two\n" }] },
		{ kind: "markdown", text: "\nAfter" },
	]);
});

test("reads open, a same-line summary and nesting", () => {
	const [outer] = splitDetails("<details open><summary>Outer</summary>\n\nText\n\n<details>\n<summary>Inner</summary>\n\nDeep\n</details>\n</details>");
	assert.equal(outer.kind, "details");
	assert.equal(outer.open, true);
	assert.equal(outer.summary, "Outer");
	assert.equal(outer.complete, true);
	assert.equal(outer.parts[1].kind, "details");
	assert.equal(outer.parts[1].summary, "Inner");
	assert.deepEqual(outer.parts[1].parts, [{ kind: "markdown", text: "\nDeep" }]);
});

test("a block still streaming runs to the end, and a half-written tag is hidden", () => {
	const parts = splitDetails("Intro\n\n<details>\n<summary>Steps</summary>\n\n1. first\n</deta");
	assert.equal(parts[1].kind, "details");
	assert.equal(parts[1].complete, false);
	assert.deepEqual(parts[1].parts, [{ kind: "markdown", text: "\n1. first" }]);
	assert.deepEqual(splitDetails("Intro\n<det"), [{ kind: "markdown", text: "Intro" }]);
	assert.equal(splitDetails("<details>\n<summary>Long sum")[0].summary, "Long sum");
});

test("tags inside code, inline or indented stay Markdown", () => {
	const text = `Use \`<details>\` inline.\n\n${fence}html\n<details>\n<summary>x</summary>\n</details>\n${fence}\n\n    <details>\n`;
	assert.deepEqual(splitDetails(text), [{ kind: "markdown", text }]);
});

test("a stray closing tag outside a block is left alone", () => {
	assert.deepEqual(splitDetails("a\n</details>\n<details>\nb"), [
		{ kind: "markdown", text: "a\n</details>" },
		{ kind: "details", summary: "", open: false, complete: false, parts: [{ kind: "markdown", text: "b" }] },
	]);
});
