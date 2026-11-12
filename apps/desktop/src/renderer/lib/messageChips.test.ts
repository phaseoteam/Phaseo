import { describe, expect, it } from "vitest";
import { chipLabel, filePath, messageChips, textChips } from "./messageChips";

const chat = "3cc43115-02f3-406a-8101-604a3af05e44";
const file = (path: string, position: { line?: number; column?: number } = {}) => ({ kind: "file" as const, path, ...position });

describe("message chips", () => {
	it("chips chat tokens, @mentions, links and clear paths in a user message", () => {
		expect(messageChips(`Compare @src/usage.ts with @[Fix usage](chat:${chat}) and @docs/\nsee https://github.com/a/b/pull/12.`)).toEqual([
			"Compare ", file("src/usage.ts"), " with ", { kind: "chat", id: chat, label: "Fix usage" }, " and ", { kind: "folder", path: "docs/" }, "\nsee ", { kind: "link", href: "https://github.com/a/b/pull/12" }, ".",
		]);
	});
	it("chips absolute, relative and positioned paths", () => {
		expect(textChips("Open E:\\phaseo\\apps\\main.ts:12 or /Users/me/notes, ./run.sh and (apps/web/src/page.tsx#L4C2).")).toEqual([
			"Open ", file("E:\\phaseo\\apps\\main.ts", { line: 12 }), " or ", file("/Users/me/notes"), ", ", file("./run.sh"), " and (", file("apps/web/src/page.tsx", { line: 4, column: 2 }), ").",
		]);
		expect(filePath(".github/workflows/ci.yml")).toEqual(file(".github/workflows/ci.yml"));
		expect(filePath("node_modules/@types/node/index.d.ts")).toEqual(file("node_modules/@types/node/index.d.ts"));
		expect(filePath("~/.config/phaseo")).toEqual(file("~/.config/phaseo"));
	});
	it("leaves versions, emails, fractions, prose, routes, domains and scoped packages as text", () => {
		for (const text of ["v1.2.3", "1.2.3", "me@example.com", "1/2", "a/b", "and/or", "1/2.5", "e.g./i.e.", "React/Next.js", "/api/v1/users", "/help", "example.com/docs/index.html", "@types/node", "@someone", "ftp://host/a.txt"])
			expect(textChips(`x ${text} y`)).toEqual([`x ${text} y`]);
	});
	it("keeps code in backticks untouched", () => {
		expect(messageChips("Run `src/main.ts` then\n```\nhttps://example.com\n```\nsrc/a.ts")).toEqual(["Run `src/main.ts` then\n```\nhttps://example.com\n```\n", file("src/a.ts")]);
	});
	it("keeps balanced parentheses in links and trims trailing punctuation", () => {
		expect(textChips("(https://en.wikipedia.org/wiki/Foo_(bar)), done")).toEqual(["(", { kind: "link", href: "https://en.wikipedia.org/wiki/Foo_(bar)" }, "), done"]);
	});
	it("labels file chips with the basename and line", () => {
		expect(chipLabel(file("src/lib/a.ts", { line: 3 }))).toBe("a.ts:3");
		expect(chipLabel({ kind: "folder", path: "docs/guides/" })).toBe("guides");
	});
});
