import {
	calculateCost,
	calculateUnits,
	formatQuantity,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { calculateArtificialAnalysisBlendedRate } from "./blendedRate";
import {
	getPricingContextTiers,
	selectPricingMetersForUsage,
} from "./pricingMeterConditions";

const inputTokenMeter = {
	unit_size: 1_000_000,
	price_per_unit: "5",
};

describe("pricing calculator arithmetic", () => {
	test("uses standard pricing until a long-context condition matches", () => {
		const meters = [
			{
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "45",
				currency: "USD",
				conditions: [{ path: "input_tokens", op: "gt", value: 272_000 }],
			},
			{
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: "30",
				currency: "USD",
				conditions: [],
			},
		];

		expect(selectPricingMetersForUsage(meters, {}).at(0)?.price_per_unit).toBe("30");
		expect(selectPricingMetersForUsage(meters, { input_text_tokens: 272_001 }).at(0)?.price_per_unit).toBe("45");

		const tiers = getPricingContextTiers(meters);
		expect(tiers.map((tier) => ({ label: tier.label, detail: tier.detail }))).toEqual([
			{ label: "Standard context", detail: "Up to 272K input tokens" },
			{ label: "Long context", detail: "Over 272K input tokens" },
		]);
		expect(tiers.map((tier) => tier.meters.at(0)?.price_per_unit)).toEqual(["30", "45"]);
	});

	test("does not guess a conditional rate when a required parameter is unavailable", () => {
		const meters = [
			{
				meter: "output_image",
				unit: "image",
				unit_size: 1,
				price_per_unit: "0.011",
				currency: "USD",
				conditions: [{ path: "image_params.quality", op: "eq", value: "low" }],
			},
			{
				meter: "output_image",
				unit: "image",
				unit_size: 1,
				price_per_unit: "0.25",
				currency: "USD",
				conditions: [{ path: "image_params.quality", op: "eq", value: "high" }],
			},
		];

		expect(selectPricingMetersForUsage(meters, {})).toEqual([]);
		expect(selectPricingMetersForUsage(meters, { "image_params.quality": "high" }).at(0)?.price_per_unit).toBe("0.25");
	});

	test("calculates usage cost from the meter unit size", () => {
		expect(calculateCost(2_000_000, inputTokenMeter)).toBe(10);
	});

	test("never returns a negative cost", () => {
		expect(calculateCost(-2_000_000, inputTokenMeter)).toBe(0);
	});

	test("represents free usage as unlimited", () => {
		const units = calculateUnits(10, {
			unit_size: 1_000_000,
			price_per_unit: "0",
		});
		expect(units).toBe(Number.POSITIVE_INFINITY);
		expect(formatQuantity(units)).toBe("Unlimited");
	});

	test("uses the Artificial Analysis 7:2:1 cache-input-output blend", () => {
		const rate = calculateArtificialAnalysisBlendedRate([
			{ meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "1", currency: "USD" },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "5", currency: "USD" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "10", currency: "USD" },
		], "12:00");

		expect(rate?.blendedPer1M).toBe(2.7);
		expect(rate?.usesInputForCache).toBe(false);
	});

	test("uses the input rate for the cache share when no cache-hit rate exists", () => {
		const rate = calculateArtificialAnalysisBlendedRate([
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "5", currency: "USD" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "10", currency: "USD" },
		], "12:00");

		expect(rate?.blendedPer1M).toBe(5.5);
		expect(rate?.usesInputForCache).toBe(true);
	});
});
