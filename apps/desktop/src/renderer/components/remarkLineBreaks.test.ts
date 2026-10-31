import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkLineBreaks } from "./remarkLineBreaks";

type Node = { type: string; value?: string; children?: Node[] };
const processor = unified().use(remarkParse).use(remarkLineBreaks);
const parse = (text: string) => processor.runSync(processor.parse(text)) as Node;
const shape = (node: Node): unknown => node.children ? { [node.type]: node.children.map(shape) } : node.value ?? node.type;

describe("remarkLineBreaks", () => {
	it("keeps each typed newline as a line break", () => {
		expect(shape(parse("first\nsecond\n\n**third**\nfourth"))).toEqual({ root: [{ paragraph: ["first", "break", "second"] }, { paragraph: [{ strong: ["third"] }, "break", "fourth"] }] });
	});
	it("leaves code alone", () => {
		expect(shape(parse("```\na\nb\n```"))).toEqual({ root: ["a\nb"] });
	});
});
