import {
	buildExpiryLocalInput,
	parseOptionalExpiryInput,
} from "./expiryDateTime";

describe("expiry date/time helpers", () => {
	it("builds an empty value when no date is selected", () => {
		expect(buildExpiryLocalInput("", "12:30")).toBe("");
	});

	it("builds combined local datetime using chosen time", () => {
		expect(buildExpiryLocalInput("2026-03-22", "09:15")).toBe(
			"2026-03-22T09:15"
		);
	});

	it("falls back to default time when time input is blank", () => {
		expect(buildExpiryLocalInput("2026-03-22", "  ")).toBe(
			"2026-03-22T23:59"
		);
		expect(buildExpiryLocalInput("2026-03-22", "", "08:00")).toBe(
			"2026-03-22T08:00"
		);
	});

	it("returns null for empty expiry input", () => {
		expect(parseOptionalExpiryInput(null)).toBeNull();
		expect(parseOptionalExpiryInput("")).toBeNull();
		expect(parseOptionalExpiryInput("   ")).toBeNull();
	});

	it("parses a valid local datetime string to ISO", () => {
		const input = "2026-03-22T23:59";
		expect(parseOptionalExpiryInput(input)).toBe(new Date(input).toISOString());
	});

	it("throws for invalid expiry input", () => {
		expect(() => parseOptionalExpiryInput("not-a-date")).toThrow(
			"Invalid expiry date"
		);
	});
});
