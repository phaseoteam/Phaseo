import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

// App-kit sources import siblings without an extension (bundlers resolve them); plain Node needs the ".ts" added.
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
	try { return await next(specifier, context); }
	catch (error) { if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + ".ts", context); throw error; }
}`));
const { createMarkdownPrefixCache, lastCleanBreak } = await import("../src/markdownPrefixCache.ts");
const { chipMarkdown } = await import("../src/messageChipsMarkdown.ts");
const { normalizeChatMarkdown } = await import("../src/markdownMath.ts");

const transform = markdown => chipMarkdown(normalizeChatMarkdown(markdown));
const fence = "```";
const documents = [
	`# Review of \`apps/web/src/lib/auth.ts:42\`\n\nSee https://phaseo.app/docs and branch fix/auth-20261013 (commit 7662e93590).\n\n${fence}ts\nconst a = "apps/web/x.ts";\n\nconst b = 1;\n${fence}\n\nRun http://localhost:3100/auth now.\n`,
	`Growth $\\frac{1}{2}$ and $5 and $10.\n\n$$\nx^2\n\n+ y\n$$\n\nAfter math \`src/a.ts\`.\n\n$$a$$ inline display.\n`,
	`- item one \`src/a.ts\`\n\n    indented code src/b.ts\n\n  continuation fix/branch-1\n\n> ${fence}\n> quoted fence src/c.ts\n>\n> ${fence}\n\nend src/d.ts\n`,
	`~~~\nunclosed fence src/a.ts\n\nstill code\n`,
	`[ref]: https://example.com\n\n<details>\n<summary>s</summary>\n\nsrc/a.ts\n\n</details>\n\n\n\nmany blanks src/b.ts\n`,
];

test("matches transforming the whole text at every prefix of a stream", () => {
	for (const document of documents) for (const step of [1, 3, 17]) {
		const cached = createMarkdownPrefixCache(transform);
		for (let end = 0; end <= document.length; end += step) {
			const prefix = document.slice(0, end);
			assert.equal(cached(prefix), transform(prefix), `step ${step}, prefix ${JSON.stringify(prefix)}`);
		}
		assert.equal(cached(document), transform(document));
	}
});

test("starts over when the text is not an extension of the last one", () => {
	const cached = createMarkdownPrefixCache(transform);
	cached("first paragraph src/a.ts\n\nsecond");
	assert.equal(cached("other src/b.ts\n\nthird"), transform("other src/b.ts\n\nthird"));
});

test("never breaks inside a fence or display math", () => {
	assert.equal(lastCleanBreak(`${fence}\na\n\nb\n`), -1);
	assert.equal(lastCleanBreak("$$\na\n\nb\n"), -1);
	assert.equal(lastCleanBreak("a\n\nb"), 3);
});

test("chipMarkdown turns prose into plain links before chips, outside code and links", () => {
	const links = text => text.split(/(#\d+)/).map(piece => /^#\d+$/.test(piece) ? { label: piece, url: `https://github.com/o/r/issues/${piece.slice(1)}` } : piece);
	assert.equal(chipMarkdown("Fixes #3 and `#4` [#5](https://x)", links), "Fixes [#3](https://github.com/o/r/issues/3) and `#4` [#5](https://x)");
	assert.equal(chipMarkdown("```\n#6\n```", links), "```\n#6\n```");
	assert.equal(chipMarkdown("odd", () => [{ label: "a]b", url: "https://x/(y)" }]), String.raw`[a\]b](https://x/%28y%29)`);
});
