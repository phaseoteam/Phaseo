import { describe, expect, it } from "vitest";
import { tableCsv, tableMarkdown } from "./markdownTable";

describe("table copying", () => {
	const rows = [["Model", "Price"], ["A | B", "$1,000"], ["Quote \"x\""]];
	it("writes GitHub Markdown with escaped pipes and padded rows", () => {
		expect(tableMarkdown(rows)).toBe("| Model | Price |\n| --- | --- |\n| A \\| B | $1,000 |\n| Quote \"x\" |  |");
		expect(tableMarkdown([])).toBe("");
	});
	it("writes CSV that quotes commas and quotes", () => {
		expect(tableCsv(rows)).toBe("Model,Price\r\nA | B,\"$1,000\"\r\n\"Quote \"\"x\"\"\"");
	});
});
