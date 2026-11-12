import { test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { CacheWritePricing, groupCacheWriteTiers } from "./CacheWritePricing";
import type { TokenTier } from "./pricingHelpers";

const tiers: TokenTier[] = [
	["gt", "12h", 10], ["lte", "30m", 2.5],
	["gt", "30m", 5], ["lte", "12h", 5],
].map(([op, ttl, price], index) => ({
	meter: `cached_write_text_tokens_${ttl}`,
	conditions: [{ path: "input_tokens", op: String(op), value: 272000 }],
	per1M: Number(price), price: Number(price), label: "unused combined label",
	ruleId: `cache-${index}`, isCurrent: true,
}));

function renderPricing(rows = tiers, locale = "en-GB") {
	return load(renderToStaticMarkup(
		<CacheWritePricing label="Cache Writes" groups={groupCacheWriteTiers(rows)!}
			unitLabel="Per 1M tokens" freeLabel="Free" locale={locale}
			localizeLabel={(value) => value ?? ""} />,
	));
}

test("renders each lifetime once with its own short and long context prices", () => {
	const $ = renderPricing();
	expect($("h5").map((_, el) => $(el).text()).get()).toEqual(["30 minutes", "12 hours"]);
	expect($("dl").map((_, el) => $(el).find("dd").map((__, row) => $(row).text()).get()).get()).toEqual(["$2.5", "$5", "$5", "$10"]);
	expect($("dt").map((_, el) => $(el).text()).get()).toEqual([
		"≤ 272k input tokens", "> 272k input tokens", "≤ 272k input tokens", "> 272k input tokens",
	]);
	expect($.text().match(/Per 1M tokens/g)).toHaveLength(1);
	expect($.text()).not.toContain("TTL");
});

test("keeps promotional base prices and free prices inside the matching lifetime", () => {
	const $ = renderPricing(tiers.map((tier): TokenTier => tier.ruleId === "cache-1"
		? { ...tier, per1M: 0, basePer1M: 2.5, comparisonKind: "discount" }
		: tier));
	expect($("dl").first().find("s").text()).toBe("$2.5");
	expect($("dl").first().find("dd").first().text()).toBe("$2.5Free");
	expect($("dl").last().find("s")).toHaveLength(0);
});

test("supports Anthropic lifetimes and incomplete context combinations", () => {
	const rows = [
		{ ...tiers[0], meter: "cached_write_text_tokens_1h", conditions: [], per1M: 6 },
		{ ...tiers[1], meter: "cached_write_text_tokens_5m", conditions: [], per1M: 3.75 },
	];
	const $ = renderPricing(rows);
	expect($("h5").map((_, el) => $(el).text()).get()).toEqual(["5 minutes", "1 hour"]);
	expect($("dd").map((_, el) => $(el).text()).get()).toEqual(["$3.75", "$6"]);
	expect(groupCacheWriteTiers([tiers[0]])?.[0].tiers).toHaveLength(1);
});

test("leaves generic cache writes and other meters on the existing display path", () => {
	expect(groupCacheWriteTiers([])).toBeNull();
	expect(groupCacheWriteTiers([{ ...tiers[0], meter: "cached_write_text_tokens" }])).toBeNull();
	expect(groupCacheWriteTiers([...tiers, { ...tiers[0], meter: "input_text_tokens" }])).toBeNull();
});

test("formats lifetime headings in the selected locale", () => {
	const $ = renderPricing(tiers, "fr-FR");
	expect($("h5").map((_, el) => $(el).text().replace(/\s/g, " ")).get()).toEqual(["30 minutes", "12 heures"]);
});
