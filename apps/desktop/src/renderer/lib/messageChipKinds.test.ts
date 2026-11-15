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

	it("keeps chat tokens as chat chips", () => {
		const out = chipMarkdown("Ask @[Pricing plan](chat:t1).");
		expect(out).toMatch(/^Ask \[Pricing plan\]\(phaseo-chip:chat:/);
	});
});
