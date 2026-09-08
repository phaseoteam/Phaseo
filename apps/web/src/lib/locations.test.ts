import { formatLocation } from "./locations";

describe("formatLocation", () => {
	it("renders subdivision and country names", () => {
		expect(formatLocation("US", "US-MO")).toBe("Missouri, United States");
	});

	it("falls back to the country name when no subdivision is known", () => {
		expect(formatLocation("FR", null)).toBe("France");
	});
});
