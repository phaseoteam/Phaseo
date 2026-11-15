import { describe, expect, it } from "vitest";
import { chipFromLinkUrl, chipMarkdown } from "@phaseo/app-kit/message-chips-markdown";
import { chipHref, chipLabel, codeChip, textChips } from "./messageChips";

describe("chip kinds", () => {
	it("finds commits with a digit and a letter, and branches by their prefix", () => {
		expect(textChips("Committed a1b2c3d on feat/web-chips; deadbeef and 1234567 stay text.")).toEqual([
			"Committed ", { kind: "commit", sha: "a1b2c3d" }, " on ", { kind: "branch", name: "feat/web-chips" }, "; deadbeef and 1234567 stay text.",
		]);
		expect(textChips("fix/usage.ts is a file")).toEqual([{ kind: "file", path: "fix/usage.ts" }, " is a file"]);
		expect(textChips("docs/guide stays text")).toEqual(["docs/guide stays text"]);
		expect(chipHref({ kind: "commit", sha: "a1b2c3d" }, { repository: "phaseo/phaseo" })).toBe("https://github.com/phaseo/phaseo/commit/a1b2c3d");
		expect(chipHref({ kind: "branch", name: "feat/x" })).toBeUndefined();
	});

	it("finds local servers only as full URLs", () => {
		expect(textChips("Open http://localhost:5173/settings, not 127.0.0.1:3000.")).toEqual([
			"Open ", { kind: "local", href: "http://localhost:5173/settings" }, ", not 127.0.0.1:3000.",
		]);
		expect(chipLabel({ kind: "local", href: "http://localhost:5173/" })).toBe("localhost:5173");
	});

	it("leaves model names, colours and request IDs as text", () => {
		const text = "Try anthropic/claude-fable-5.2 with #7c3aed and G-01HZY0EFSK2C2W5QAV9YJQW3Q7.";
		expect(textChips(text)).toEqual([text]);
		expect(codeChip("#7c3aed")).toBeUndefined();
	});

	it("reads inline code as one chip, or as nothing", () => {
		expect(codeChip("feat/x")).toEqual({ kind: "branch", name: "feat/x" });
		expect(codeChip("a1b2c3d4e5")).toEqual({ kind: "commit", sha: "a1b2c3d4e5" });
		expect(codeChip("npm install")).toBeUndefined();
	});
});

describe("chip Markdown", () => {
	it("writes chips as links and leaves code blocks, links and math alone", () => {
		const out = chipMarkdown(["See `src/usage.ts` at http://localhost:5173 and [docs](https://x.dev) for $a/b.ts$.", "```", "src/a.ts", "```"].join("\n"));
		const [first = "", ...rest] = out.split("\n");
		expect(rest).toEqual(["```", "src/a.ts", "```"]);
		expect(first).toContain("[docs](https://x.dev)");
		expect(first).toContain("$a/b.ts$");
		const urls = [...first.matchAll(/\]\((phaseo-chip:[^)]+)\)/g)].map(match => chipFromLinkUrl(match[1] ?? ""));
		expect(urls).toEqual([{ kind: "file", path: "src/usage.ts" }, { kind: "local", href: "http://localhost:5173" }]);
	});

	it("leaves every line of indented code, nested fences, display math and reference definitions alone", () => {
		const text = [
			"Run:", "", "    echo first", "    cat src/app.ts", "", "    ls src/b.ts", "After src/c.ts.",
			"- Step:", "  ```", "  src/d.ts", "  ```", "> ```", "> src/e.ts", "> ```",
			"$$", "a/b.ts", "$$",
			"[docs]: https://example.com/docs", "Read [docs][docs].",
		].join("\n");
		const out = chipMarkdown(text).split("\n");
		const chipped = out.flatMap((line, index) => line.includes("phaseo-chip:") ? [index] : []);
		// Only the prose line after the indented block.
		expect(chipped).toEqual([6]);
		expect(out.filter((_, index) => index !== 6)).toEqual(text.split("\n").filter((_, index) => index !== 6));
	});

	it("keeps a quoted fence inside a fenced example as code", () => {
		const text = ["````md", "> ```", "> src/a.ts", "> ```", "src/b.ts", "````", "After src/c.ts."].join("\n");
		const out = chipMarkdown(text).split("\n");
		expect(out.slice(0, 6)).toEqual(text.split("\n").slice(0, 6));
		expect(out[6]).toContain("phaseo-chip:");
		// A quoted fence closes at its own quote level.
		const quoted = chipMarkdown(["> ```", "> src/a.ts", "> ```", "src/b.ts"].join("\n")).split("\n");
		expect(quoted.slice(0, 3)).toEqual(["> ```", "> src/a.ts", "> ```"]);
		expect(quoted[3]).toContain("phaseo-chip:");
		// Windows line endings still close the fence.
		const crlf = chipMarkdown(["```", "src/a.ts", "```", "After src/c.ts."].join("\r\n")).split("\r\n");
		expect(crlf.slice(0, 3)).toEqual(["```", "src/a.ts", "```"]);
		expect(crlf[3]).toContain("phaseo-chip:");
	});

	it("leaves text that would make an unreadable chip as text", () => {
		const long = `https://example.com/${"a".repeat(2_100)}`;
		expect(textChips(`See ${long} now`)).toEqual([`See ${long} now`]);
		expect(chipMarkdown(`See ${long}`)).toBe(`See ${long}`);
		expect(codeChip(`feat/${"x".repeat(300)}`)).toBeUndefined();
	});

	it("reads back only chips with every field they need", () => {
		const url = (value: unknown) => `phaseo-chip:x:${encodeURIComponent(JSON.stringify(value))}`;
		expect(chipFromLinkUrl(url({ kind: "file", path: "src/a.ts", line: 3 }))).toEqual({ kind: "file", path: "src/a.ts", line: 3 });
		expect(chipFromLinkUrl(url({ kind: "link", href: {} }))).toBeUndefined();
		expect(chipFromLinkUrl(url({ kind: "link", href: "javascript:alert(1)" }))).toBeUndefined();
		expect(chipFromLinkUrl(url({ kind: "commit", sha: "not a sha" }))).toBeUndefined();
		expect(chipFromLinkUrl(url({ kind: "model", id: "x" }))).toBeUndefined();
		expect(chipFromLinkUrl(url({ kind: "file", path: "a.ts", line: "1" }))).toBeUndefined();
	});

	it("stays fast on long runs that used to backtrack", () => {
		const start = performance.now();
		chipMarkdown(`${"@[".repeat(20_000)} ${"`".repeat(20_000)} ${"![".repeat(20_000)} ${"</a".repeat(20_000)}`);
		textChips(`src/${"/".repeat(50_000)}x`);
		chipLabel({ kind: "folder", path: `a${"/".repeat(50_000)}` });
		expect(performance.now() - start).toBeLessThan(2_000);
	});

	it("keeps chat tokens as chat chips", () => {
		const out = chipMarkdown("Ask @[Pricing plan](chat:t1).");
		expect(out).toMatch(/^Ask \[Pricing plan\]\(phaseo-chip:chat:/);
	});
});
