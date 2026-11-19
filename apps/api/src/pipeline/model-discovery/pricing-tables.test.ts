import { describe, expect, it } from "vitest";
import {
	diffPricingTableContent,
	extractMdxPricingText,
	extractPriceContentText,
	extractPricingTableText,
	extractPriceValues,
	fetchPricingTableSnapshots,
	hasPricingSourceChanged,
	PRICE_VALUES_FINGERPRINT_PREFIX,
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

	it("reads Xiaomi's static pricing Markdown, whose price tables are inline HTML", () => {
		const source = PRICING_TABLE_SOURCES.find((source) => source.providerId === "xiaomi");
		expect(source?.sourceUrl).toBe("https://mimo.mi.com/static/docs/price/pay-as-you-go.md");
		expect(source?.extraction ?? "tables").toBe("tables");
		// Shape of the live file (2026-10-17): Markdown prose around <table> blocks with styled spans.
		const markdown = `# API Pricing

**Billing Instructions**

<table>
<thead><tr><th><span style="display: inline-block;">**Model Name**</span></th><th><span>**Input (Cache Miss)** </span></th><th><span>**Output**</span></th></tr></thead>
<tbody><tr><td><span>\`mimo-v2.6-pro\`</span></td><td rowspan="2"><span>$0.435</span></td><td rowspan="2"><span>$0.87</span></td></tr></tbody>
</table>`;

		expect(extractPricingTableText(markdown)).toEqual({
			tableCount: 1,
			text: "**Model Name** **Input (Cache Miss)** **Output** `mimo-v2.6-pro` $0.435 $0.87",
		});
	});

	it("does not page-monitor W&B, whose /models API already carries watched prices", () => {
		expect(PRICING_TABLE_SOURCES.some((source) => source.providerId === "weights-and-biases")).toBe(false);
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

	it("re-baselines instead of alerting when the fingerprint scheme changes", () => {
		const priceValues = `${PRICE_VALUES_FINGERPRINT_PREFIX}abc`;
		expect(hasPricingSourceChanged({ source_url: "api", fingerprint: "old-content-hash" }, { sourceUrl: "api", fingerprint: priceValues })).toBe(false);
		expect(hasPricingSourceChanged({ source_url: "api", fingerprint: priceValues }, { sourceUrl: "api", fingerprint: `${PRICE_VALUES_FINGERPRINT_PREFIX}def` })).toBe(true);
	});
});

describe("fetchPricingTableSnapshots price-content fingerprints", () => {
	// Shape of cohere.com/pricing on 2026-11-19: the sentence after the GPU table came and went between fetches.
	const gpuTable = "<table><tr><td>H100 80GB</td><td>$6.25</td><td>$4.25</td></tr><tr><td>GB200 192GB</td><td>$12.50</td><td>$10.00</td></tr></table>";
	const withNote = `<main><h2>Hourly Price</h2>${gpuTable}<p><strong>Reserved capacity available. </strong>Please contact sales.</p></main>`;
	const withoutNote = `<main><h2>Hourly Price</h2>${gpuTable}</main>`;

	async function cohereFingerprint(html: string): Promise<string> {
		const request = (async () => new Response(html)) as unknown as typeof fetch;
		const { snapshots } = await fetchPricingTableSnapshots(new Map(), request);
		const cohere = snapshots.find((snapshot) => snapshot.providerId === "cohere");
		if (!cohere) throw new Error("cohere snapshot missing");
		return cohere.fingerprint;
	}

	it("ignores copy changes around unchanged Cohere prices", async () => {
		const before = await cohereFingerprint(withNote);
		expect(before.startsWith(PRICE_VALUES_FINGERPRINT_PREFIX)).toBe(true);
		expect(await cohereFingerprint(withoutNote)).toBe(before);
		expect(await cohereFingerprint(withNote.replace("<main>", "<main><p>New hero copy</p>"))).toBe(before);
	});

	it("still detects a changed or swapped Cohere price", async () => {
		const before = await cohereFingerprint(withNote);
		expect(await cohereFingerprint(withNote.replace("$12.50", "$11.50"))).not.toBe(before);
		expect(await cohereFingerprint(withNote.replace("$6.25</td><td>$4.25", "$4.25</td><td>$6.25"))).not.toBe(before);
	});

	it("normalizes spacing and case in price values", () => {
		expect(extractPriceValues("<p>Input $ 2.50 / 1M tokens</p><script>var p = '$9'</script>")).toEqual(["$2.50/1m"]);
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
