import {
	buildExpiryLocalInput,
	buildExpirySelectionPreview,
	buildExpiryUtcIso,
	formatUtcOffset,
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

	it("builds UTC ISO from local date and time", () => {
		expect(buildExpiryUtcIso("2026-03-22", "09:15")).toBe(
			new Date(2026, 2, 22, 9, 15, 0, 0).toISOString()
		);
	});

	it("uses default time when building UTC ISO", () => {
		expect(buildExpiryUtcIso("2026-03-22", "")).toBe(
			new Date(2026, 2, 22, 23, 59, 0, 0).toISOString()
		);
	});

	it("formats UTC offsets consistently", () => {
		expect(formatUtcOffset(0)).toBe("+00:00");
		expect(formatUtcOffset(60)).toBe("+01:00");
		expect(formatUtcOffset(-300)).toBe("-05:00");
		expect(formatUtcOffset(330)).toBe("+05:30");
	});

	it("builds preview data for selected datetime", () => {
		const preview = buildExpirySelectionPreview("2026-03-22", "09:15");
		expect(preview).not.toBeNull();
		expect(preview?.timezone.length).toBeGreaterThan(0);
		expect(preview?.timezoneDisplay).toContain("UTC");
		expect(preview?.utcIso).toBe(buildExpiryUtcIso("2026-03-22", "09:15"));
	});

	it("returns null preview when no date is selected", () => {
		expect(buildExpirySelectionPreview("", "09:15")).toBeNull();
	});

	it("returns null for empty expiry input", () => {
		expect(parseOptionalExpiryInput(null)).toBeNull();
		expect(parseOptionalExpiryInput("")).toBeNull();
		expect(parseOptionalExpiryInput("   ")).toBeNull();
	});

	it("parses a timezone-aware expiry string to ISO", () => {
		const input = "2026-03-22T23:59:00.000Z";
		expect(parseOptionalExpiryInput(input)).toBe(new Date(input).toISOString());
	});

	it("throws for timezone-naive expiry input", () => {
		expect(() => parseOptionalExpiryInput("2026-03-22T23:59")).toThrow(
			"Invalid expiry date"
		);
	});

	it("throws for invalid expiry input", () => {
		expect(() => parseOptionalExpiryInput("not-a-date")).toThrow(
			"Invalid expiry date"
		);
	});
});
