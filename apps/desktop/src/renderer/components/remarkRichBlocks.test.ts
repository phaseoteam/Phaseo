import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { remarkMathGuard, remarkRichBlocks } from "./remarkRichBlocks";

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };
const tree = (text: string) => { const processor = unified().use(remarkParse).use(remarkMath, { singleDollarTextMath: true }).use(remarkMathGuard).use(remarkRichBlocks); return processor.runSync(processor.parse(text), text) as Node; };
const types = (node: Node): string[] => [node.type, ...(node.children ?? []).flatMap(types)];

describe("GitHub alerts", () => {
	it("marks the quote with its kind and drops the marker, even alone on its line", () => {
		const root = tree("> [!tip]\n> Use the cache.");
		const quote = root.children![0];
		expect(quote.data).toEqual({ hProperties: { dataAlert: "tip" } });
		expect(JSON.stringify(quote)).not.toContain("[!tip]");
		expect(JSON.stringify(quote)).toContain("Use the cache.");
	});
	it("ignores unknown kinds", () => {
		expect(tree("> [!SHOUT]\n> Hi").children![0].data).toBeUndefined();
	});
});

describe("details blocks", () => {
	it("wraps the Markdown between the tags, nesting included", () => {
		const root = tree("<details>\n<summary>Outer</summary>\n\nA\n\n<details>\n<summary>Inner</summary>\n\nB\n\n</details>\n\n</details>\n\nAfter");
		expect(types(root).filter(type => type === "details")).toHaveLength(2);
		expect(root.children!.map(child => child.type)).toEqual(["details", "paragraph"]);
		expect(root.children![0].children![0]).toMatchObject({ type: "detailsSummary", children: [{ value: "Outer" }] });
	});
	it("handles a one-line block and leaves an unclosed one as written", () => {
		expect(tree("<details><summary>S</summary>Body</details>").children![0]).toMatchObject({ type: "details", children: [{ type: "detailsSummary" }, { type: "paragraph", children: [{ value: "Body" }] }] });
		expect(tree("<details>\n<summary>S</summary>\n\nStill streaming").children![0].type).toBe("html");
	});
});

describe("single-dollar maths", () => {
	it("follows Pandoc's rule so prices stay text", () => {
		expect(types(tree("It costs $5 and $10 today."))).not.toContain("inlineMath");
		expect(JSON.stringify(tree("It costs $5 and $10 today."))).toContain("It costs $5 and $10 today.");
		expect(types(tree("between $5-$10"))).not.toContain("inlineMath");
		expect(types(tree("Let $x$ be $\\alpha+1$."))).toEqual(expect.arrayContaining(["inlineMath"]));
		expect(types(tree("Display $$x$$ inline"))).toContain("inlineMath");
	});
});
