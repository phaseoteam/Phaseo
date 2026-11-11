import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { describe, expect, it } from "vitest";
import { extractLargeTables, extractTablesFrom, remarkLargeTables } from "./largeTables";
import { remarkMathGuard } from "./remarkRichBlocks";

const rows = (count: number) => Array.from({ length: count }, (_, row) => `| ${row} | **provider-${row % 17}** | \`${(row * 0.37).toFixed(2)} ms\` | [docs](https://example.com/${row}) |`).join("\n");
const table = (count: number) => `| # | Provider | Latency | Link |\n| :-- | --- | --: | :-: |\n${rows(count)}`;
// The parsed tree without positions, so a lifted and rebuilt tree compares with the original.
const tree = (markdown: string, lift = false) => {
	const { text, tables } = lift ? extractLargeTables(markdown) : { text: markdown, tables: [] };
	const processor = unified().use(remarkParse).use(remarkGfm);
	if (lift) processor.use(remarkLargeTables, { tables });
	const root = processor.runSync(processor.parse(text));
	return JSON.parse(JSON.stringify(root, (key, value) => key === "position" ? undefined : value));
};

describe("large tables", () => {
	it("builds exactly the tree the whole message parses to", () => {
		for (const markdown of [table(900), `Intro paragraph.\n\n${table(420)}\n\nAfter the table.\n\n${table(160)}\n`, `# Heading\n\n${table(250)}\n\n\`\`\`ts\nconst x = 1;\n\`\`\``]) {
			expect(extractLargeTables(markdown).tables.length).toBeGreaterThan(0);
			expect(tree(markdown, true)).toEqual(tree(markdown));
		}
	});

	it("leaves short tables, code, indented, glued and lazily continued tables alone", () => {
		const cases = [
			table(extractTablesFrom - 1),
			`\`\`\`md\n${table(400)}\n\`\`\``,
			`- item\n\n  ${table(400).split("\n").join("\n  ")}`,
			`A paragraph line\n${table(400)}`,
			`${table(300)}\nlazy row without a pipe\n\nEnd.`,
			`${table(300)}\n\n[ref]: https://example.com`,
		];
		for (const markdown of cases) expect(extractLargeTables(markdown), markdown.slice(0, 40)).toEqual({ text: markdown, tables: [] });
	});

	it("keeps the dollar rule for lifted tables, with the message's own plugins", () => {
		// The rule (remarkMathGuard) reads each `$…$` back from the source text, which a lifted table is not part of.
		const priced = `| Plan | Price |\n| --- | --- |\n${Array.from({ length: 200 }, (_, row) => `| plan ${row} | $5 and $10 |`).join("\n")}\n\nInline $x^2$ stays math.`;
		const messageTree = (lift: boolean) => {
			const { text, tables } = lift ? extractLargeTables(priced) : { text: priced, tables: [] };
			const processor = unified().use(remarkParse);
			if (lift) processor.use(remarkLargeTables, { tables });
			processor.use(remarkMath, { singleDollarTextMath: true }).use(remarkMathGuard).use(remarkGfm);
			return JSON.parse(JSON.stringify(processor.runSync(processor.parse(text), text), (key, value) => key === "position" ? undefined : value));
		};
		expect(extractLargeTables(priced).tables).toHaveLength(1);
		const lifted = messageTree(true);
		expect(lifted).toEqual(messageTree(false));
		expect(JSON.stringify(lifted.children[0].children[1])).toContain('"value":"$5 and $10"');
		expect(JSON.stringify(lifted.children.at(-1))).toContain('"type":"inlineMath"');
	});

	it("parses a long table in near-linear time", () => {
		const time = (count: number, lift: boolean) => { const markdown = table(count), started = performance.now(); tree(markdown, lift); return performance.now() - started; };
		time(200, true);
		// The best of three lifted runs, so a collection pause on a busy machine doesn't decide the result.
		const lifted = Math.min(time(1800, true), time(1800, true), time(1800, true)), whole = time(1800, false);
		// Whole, 1,800 rows take over a second; lifted, eighteen 100-row documents.
		expect(lifted).toBeLessThan(whole / 3);
	});
});
