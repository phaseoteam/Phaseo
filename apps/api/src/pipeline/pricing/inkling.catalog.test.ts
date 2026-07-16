import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeBillSummary } from "./engine";
import type { PriceCard } from "./types";

const DATA_ROOT = path.resolve(process.cwd(), "../../packages/data/catalog/src/data");

function loadCard(relativePath: string): PriceCard {
	return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, relativePath), "utf8")) as PriceCard;
}

describe("Thinking Machines Inkling promotional billing", () => {
	it.each([
		["64K", "thinkingmachines-inkling-64k", "6.924000000"],
		["256K", "thinkingmachines-inkling", "13.848000000"],
	])("selects the active %s promotional rules", (_label, directory, expectedCost) => {
		const card = loadCard(
			`pricing/thinking-machines/${directory}/text.generate/pricing.json`,
		);
		const result = computeBillSummary(
			{
				input_text_tokens: 1_000_000,
				cached_read_text_tokens: 1_000_000,
				output_text_tokens: 1_000_000,
			},
			card,
			{},
			"standard",
		);

		expect(result.cost_usd_str).toBe(expectedCost);
		expect(result.lines).toHaveLength(3);
		expect(result.lines.every((line) => line.rule_priority === 200)).toBe(true);
	});
});
