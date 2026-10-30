import { formatGatewayMetricWindow } from "./getMarketingMetrics";

describe("formatGatewayMetricWindow", () => {
	it("describes the 30-day gateway marketing window", () => {
		expect(formatGatewayMetricWindow(24 * 30)).toBe("1mo");
	});

	it("falls back to hours for partial days", () => {
		expect(formatGatewayMetricWindow(36)).toBe("36h");
	});
});
