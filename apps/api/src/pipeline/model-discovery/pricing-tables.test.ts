import { describe, expect, it } from "vitest";
import {
	diffPricingTableContent,
	extractMdxPricingText,
	extractPriceContentText,
	extractPricingTableText,
	hasPricingSourceChanged,
	PRICING_TABLE_SOURCES,
	pricingContentLines,
} from "./pricing-tables";

describe("extractPricingTableText", () => {
	it("watches Mistral API tables without subscription or marketing changes", () => {
		const source = PRICING_TABLE_SOURCES.find((source) => source.providerId === "mistral");
		expect(source?.sourceUrl).toBe("https://docs.mistral.ai/inference/pricing");
		expect(source?.extraction ?? "tables").toBe("tables");
		const rates = '<table><tr><th>Model</th><th>Input</th><th>Output</th></tr><tr><td>Mistral Large</td><td>$0.50</td><td>$1.50</td></tr></table>';
		const previous = extractPricingTableText(`<p>Pro $14.99 /mo. Limited coding.</p>${rates}`);
		const current = extractPricingTableText(`<p>Pro $25 /mo. All-day coding.</p>${rates}`);
		expect(current).toEqual(previous);
		expect(extractPricingTableText(rates.replace("$0.50", "$0.60"))).not.toEqual(previous);
	});

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
			<table><tr><th>Model</th><th>Price</th></tr><tr><td>Example</td><td>¥3 / M tokens</td></tr></table>
		`);

		expect(result).toEqual({
			tableCount: 1,
			text: "Model Price Example ¥3 / M tokens",
		});
	});

	it("does not double-unescape nested HTML entities", () => {
		const result = extractPricingTableText(`
			<table><tr><th>Price</th></tr><tr><td>&amp;lt; $1 / M</td></tr></table>
		`);

		expect(result.text).toContain("&lt; $1 / M");
		expect(result.text).not.toContain("< $1 / M");
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

describe("hasPricingSourceChanged", () => {
	it("initializes a baseline when the source URL changes", () => {
		expect(hasPricingSourceChanged({ source_url: "https://mistral.ai/pricing/", fingerprint: "old" }, {
			sourceUrl: "https://docs.mistral.ai/inference/pricing", fingerprint: "new",
		})).toBe(false);
		expect(hasPricingSourceChanged(undefined, { sourceUrl: "api", fingerprint: "new" })).toBe(false);
	});

	it("detects changed rates on the same source", () => {
		expect(hasPricingSourceChanged({ source_url: "api", fingerprint: "old" }, { sourceUrl: "api", fingerprint: "new" })).toBe(true);
		expect(hasPricingSourceChanged({ source_url: "api", fingerprint: "same" }, { sourceUrl: "api", fingerprint: "same" })).toBe(false);
	});
});

describe("diffPricingTableContent", () => {
	it("reports added and removed price lines", () => {
		const previous = ["Command A input $2.50 / 1M tokens", "Command A output $10 / 1M tokens"];
		const current = ["Command A input $2.00 / 1M tokens", "Command A output $10 / 1M tokens"];

		expect(diffPricingTableContent(previous, current)).toEqual({
			added: ["Command A input $2.00 / 1M tokens"],
			removed: ["Command A input $2.50 / 1M tokens"],
		});
	});

	it("treats a missing baseline as no diff", () => {
		expect(diffPricingTableContent(null, ["$1 / M tokens"])).toEqual({ added: [], removed: [] });
	});
});

describe("pricingContentLines", () => {
	it("splits normalized content into capped trimmed lines", () => {
		const lines = pricingContentLines("  $2 / M tokens  \n\n$3 / M output tokens");
		expect(lines).toEqual(["$2 / M tokens", "$3 / M output tokens"]);
	});

	it("caps line count and length", () => {
		const many = Array.from({ length: 200 }, (_, index) => `$${index} / M`).join("\n");
		expect(pricingContentLines(many)).toHaveLength(120);
		const longLine = "$1 / M tokens".repeat(30);
		const truncated = pricingContentLines(longLine);
		expect(truncated).toHaveLength(1);
		expect(truncated[0]).toHaveLength(240);
		expect(truncated[0]!.endsWith("…")).toBe(true);
	});
});
