import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = path.resolve(process.cwd(), "../../packages/data/catalog/src/data");

function readJson(relativePath: string) {
	return JSON.parse(fs.readFileSync(path.join(DATA_ROOT, relativePath), "utf8"));
}

function pricingRates(pricing: any) {
	return pricing.rules.map((rule: any) => ({
		pricing_plan: rule.pricing_plan,
		meter: rule.meter,
		price_per_unit: rule.price_per_unit,
		match: rule.match,
	}));
}

describe("pricing catalogue billing integrity", () => {
	it("keeps GPT-5.6 Sol canonical and Pro alias rates identical", () => {
		const canonical = readJson("pricing/openai/openai-gpt-5.6-sol/text.generate/pricing.json");
		const proAlias = readJson("pricing/openai/openai-gpt-5.6-sol-pro/text.generate/pricing.json");

		expect(pricingRates(proAlias)).toEqual(pricingRates(canonical));
		expect(canonical.rules.some((rule: any) => rule.meter === "output_reasoning_tokens")).toBe(false);
		expect(proAlias.rules.some((rule: any) => rule.meter === "output_reasoning_tokens")).toBe(false);
	});

	it("uses published GPT-5.6 Sol rates at normal and high context", () => {
		const canonical = readJson("pricing/openai/openai-gpt-5.6-sol/text.generate/pricing.json");
		const rates = (rules: any[]) => rules.map((rule: any) => ({
			meter: rule.meter,
			price_per_unit: rule.price_per_unit,
		}));
		const expected = {
			standard: {
				normal: [5, 0.5, 6.25, 30],
				high: [10, 1, 12.5, 45],
			},
			flex: {
				normal: [2.5, 0.25, 3.125, 15],
				high: [5, 0.5, 6.25, 22.5],
			},
			priority: {
				normal: [10, 1, 12.5, 60],
				high: [20, 2, 25, 90],
			},
		};
		const meters = [
			"input_text_tokens",
			"cached_read_text_tokens",
			"cached_write_text_tokens",
			"output_text_tokens",
		];

		for (const [plan, planRates] of Object.entries(expected)) {
			const rules = canonical.rules.filter((rule: any) => rule.pricing_plan === plan);
			expect(rates(rules.filter((rule: any) => rule.match.length === 0))).toEqual(
				meters.map((meter, index) => ({ meter, price_per_unit: planRates.normal[index] })),
			);
			expect(rates(rules.filter((rule: any) => rule.match.length > 0))).toEqual(
				meters.map((meter, index) => ({ meter, price_per_unit: planRates.high[index] })),
			);
		}
	});

	it("maps Inkling pricing to the corresponding public gateway model IDs", () => {
		const baseten = readJson("pricing/baseten/thinkingmachines-inkling/text.generate/pricing.json");
		const thinkingMachines = readJson(
			"pricing/thinking-machines/thinkingmachines-inkling/text.generate/pricing.json",
		);
		const thinkingMachines64k = readJson(
			"pricing/thinking-machines/thinkingmachines-inkling-64k/text.generate/pricing.json",
		);

		expect(baseten).toMatchObject({
			key: "baseten:thinking-machines/inkling:text.generate",
			api_model_id: "thinking-machines/inkling",
		});
		expect(thinkingMachines).toMatchObject({
			key: "thinking-machines:thinking-machines/inkling:text.generate",
			api_model_id: "thinking-machines/inkling",
		});
		expect(thinkingMachines64k).toMatchObject({
			key: "thinking-machines:thinking-machines/inkling-64k:text.generate",
			api_model_id: "thinking-machines/inkling-64k",
		});
	});

	it("routes both priced Thinking Machines Inkling variants", () => {
		const models = readJson("api_providers/thinking-machines/models.json");
		const main = models.find((row: any) => row.api_model_id === "thinking-machines/inkling");
		const small = models.find((row: any) => row.api_model_id === "thinking-machines/inkling-64k");

		expect(main?.is_active_gateway).toBe(true);
		expect(small?.is_active_gateway).toBe(true);
		expect(small?.capabilities).toEqual(expect.arrayContaining([
			expect.objectContaining({ capability_id: "text.generate", status: "active" }),
		]));
	});

	it.each([
		["64K", "thinkingmachines-inkling-64k", [3.74, 0.748, 9.36], [1.87, 0.374, 4.68]],
		["256K", "thinkingmachines-inkling", [7.48, 1.496, 18.72], [3.74, 0.748, 9.36]],
	])("stores %s Inkling list prices and the active 50%% promotion", (_label, directory, list, promotional) => {
		const pricing = readJson(
			`pricing/thinking-machines/${directory}/text.generate/pricing.json`,
		);
		const meters = ["input_text_tokens", "cached_read_text_tokens", "output_text_tokens"];
		const ratesAtPriority = (priority: number) => pricing.rules
			.filter((rule: any) => rule.priority === priority)
			.map((rule: any) => ({ meter: rule.meter, price: rule.price_per_unit }));

		expect(ratesAtPriority(100)).toEqual(
			meters.map((meter, index) => ({ meter, price: list[index] })),
		);
		expect(ratesAtPriority(200)).toEqual(
			meters.map((meter, index) => ({ meter, price: promotional[index] })),
		);
		expect(pricing.rules.filter((rule: any) => rule.priority === 200)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ effective_from: "2026-07-15T00:00:00Z" }),
			]),
		);
	});
});
