import {
	getPricingHistoryLineStyle,
	orderPricingHistoryTooltipItems,
	selectPricingHistoryTooltipItems,
} from "@/components/(data)/model/pricing/pricingHistoryTooltip";

describe("orderPricingHistoryTooltipItems", () => {
	test("matches the chart series order", () => {
		const items = [
			{ key: "provider-b", price: 0.07 },
			{ key: "provider-a", price: 0.15 },
			{ key: "provider-c", price: 0.15 },
		];

		expect(orderPricingHistoryTooltipItems(items, ["provider-a", "provider-b", "provider-c"], (item) => item.key)).toEqual([
			items[1],
			items[0],
			items[2],
		]);
	});
});

describe("selectPricingHistoryTooltipItems", () => {
	test("keeps every item when the list fits", () => {
		expect(selectPricingHistoryTooltipItems([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({
			items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			hiddenCount: 0,
		});
	});

	test("shows the six lowest and six highest items", () => {
		expect(selectPricingHistoryTooltipItems(Array.from({ length: 27 }, (_, index) => index))).toEqual({
			items: [0, 1, 2, 3, 4, 5, 21, 22, 23, 24, 25, 26],
			hiddenCount: 15,
		});
	});

	test("hides only the middle item when there are 13 items", () => {
		expect(selectPricingHistoryTooltipItems(Array.from({ length: 13 }, (_, index) => index))).toEqual({
			items: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12],
			hiddenCount: 1,
		});
	});
});

describe("getPricingHistoryLineStyle", () => {
	test("emphasizes a visible series and dims its siblings", () => {
		expect(getPricingHistoryLineStyle("provider-a", "provider-a", ["provider-a", "provider-b"])).toEqual({
			strokeOpacity: 1,
			strokeWidth: 3,
			activeDotRadius: 4,
		});
		expect(getPricingHistoryLineStyle("provider-b", "provider-a", ["provider-a", "provider-b"])).toEqual({
			strokeOpacity: 0.18,
			strokeWidth: 1.8,
			activeDotRadius: 3,
		});
	});

	test("does not dim or reveal a series that is hidden", () => {
		expect(getPricingHistoryLineStyle("provider-b", "provider-b", ["provider-a"])).toEqual({
			strokeOpacity: 1,
			strokeWidth: 1.8,
			activeDotRadius: 3,
		});
	});
});
