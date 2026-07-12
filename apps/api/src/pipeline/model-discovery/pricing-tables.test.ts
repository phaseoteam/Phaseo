import { describe, expect, it } from "vitest";
import { extractMdxPricingText, extractPriceContentText, extractPricingTableText } from "./pricing-tables";

describe("extractPricingTableText", () => {
	it("keeps price-bearing tables and ignores unrelated tables", () => {
		const result = extractPricingTableText(`
			<table><tr><th>Model</th><th>Context</th></tr><tr><td>Example</td><td>128K</td></tr></table>
			<table><tr><th>Model</th><th>Price</th></tr><tr><td>Example</td><td>$1 / M</td></tr></table>
		`);

		expect(result).toEqual({
			tableCount: 1,
			text: "Model Price Example $1 / M",
		});
	});

	it("keeps non-USD pricing tables", () => {
		const result = extractPricingTableText(`
			<table><tr><th>Model</th><th>Price</th></tr><tr><td>Example</td><td>\u00A53 / M tokens</td></tr></table>
		`);

		expect(result).toEqual({
			tableCount: 1,
			text: "Model Price Example \u00A53 / M tokens",
		});
	});

	it("extracts price-bearing content cards without hashing page scripts", () => {
		const result = extractPriceContentText(`
			<script>window.dynamic = Date.now()</script>
			<section><h2>Command A pricing</h2><p>Input $2.50 / 1M tokens</p><p>Output $10 / 1M tokens</p></section>
		`);

		expect(result.tableCount).toBe(1);
		expect(result.text).toContain("Command A pricing");
		expect(result.text).toContain("$2.50 / 1M tokens");
		expect(result.text).not.toContain("Date.now");
	});

	it("extracts pricing rows from MDX documentation", () => {
		const result = extractMdxPricingText(`
			<DocTable
				columns={[{ title: "Input Price" }]}
				rows={[["example", <> {"$"}0.16</>]]}
			/>
		`);

		expect(result).toEqual({
			tableCount: 1,
			text: 'columns={[{ title: "Input Price" }]} rows={[["example", $0.16]]}',
		});
	});
});
