import { assignPerceptualSeriesColours, getPricingTierDasharray } from "@/components/(rankings)/chart-colors";

describe("pricing chart visual encoding", () => {
	it("assigns different provider colours even when hashes collide", () => {
		const colours = assignPerceptualSeriesColours(["deepinfra", "deepseek", "novita"]);
		expect(new Set(Object.values(colours).map((entry) => entry.stroke)).size).toBe(3);
	});

	it("keeps generated provider colours unique beyond the base palette", () => {
		const colours = assignPerceptualSeriesColours(Array.from({ length: 9 }, (_, index) => `provider-${index}`));
		expect(new Set(Object.values(colours).map((entry) => entry.stroke)).size).toBe(9);
	});

	it("uses a distinct line pattern for each supported service tier", () => {
		expect(getPricingTierDasharray("standard")).toBeUndefined();
		expect(getPricingTierDasharray("free")).toBe("1 5");
		expect(getPricingTierDasharray("priority")).toBe("8 4");
		expect(getPricingTierDasharray("flex")).toBe("10 3 2 3");
		expect(getPricingTierDasharray("batch")).toBe("16 4");
		expect(getPricingTierDasharray("toString")).toBe("6 4");
	});
});
