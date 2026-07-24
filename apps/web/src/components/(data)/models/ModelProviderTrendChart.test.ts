import { getSeriesEmphasis } from "./ModelProviderTrendChart";

describe("getSeriesEmphasis", () => {
	it("emphasizes the hovered series and dims every other series", () => {
		expect(getSeriesEmphasis("p90", "p90")).toEqual({
			isActive: true,
			isDimmed: false,
		});
		expect(getSeriesEmphasis("p90", "p50")).toEqual({
			isActive: false,
			isDimmed: true,
		});
	});

	it("keeps all series at their normal emphasis without a hover target", () => {
		expect(getSeriesEmphasis(null, "provider-openai")).toEqual({
			isActive: false,
			isDimmed: false,
		});
	});
});
