import {
	DEFAULT_DISPLAY_PREFERENCES,
	formatDisplayCalendarDate,
	formatDisplayDate,
	formatDisplayDateParts,
	formatDisplayDateTime,
	formatDisplayDateTimeRange,
	formatDisplayNumber,
	formatDisplayTimestamp,
	normalizeDisplayPreferences,
	readableForegroundForAccent,
} from "./displayPreferences";

describe("display preferences", () => {
	it("normalizes invalid values to safe defaults", () => {
		expect(normalizeDisplayPreferences({
			locale: "fr-FR",
			dateStyle: "custom",
			timeZone: "Mars/Olympus_Mons",
		})).toEqual(DEFAULT_DISPLAY_PREFERENCES);
	});

	it("formats dates using the selected locale and time zone", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-GB" as const,
			dateStyle: "short" as const,
			timeZone: "Europe/London",
			hourCycle: "24h" as const,
		};
		expect(formatDisplayDate("2026-09-19T23:30:00Z", preferences)).toBe("20/09/2026");
		expect(formatDisplayDateTime("2026-09-19T23:30:00Z", preferences)).toContain("00:30");
	});

	it("supports ISO dates and explicit 12-hour clocks", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-US" as const,
			dateStyle: "iso" as const,
			timeZone: "UTC",
			hourCycle: "12h" as const,
		};
		expect(formatDisplayDateTime("2026-09-19T16:35:00Z", preferences)).toBe("2026-09-19, 04:35 PM");
		expect(formatDisplayDateTimeRange(
			"2026-09-19T16:35:00Z",
			"2026-09-19T17:35:00Z",
			preferences,
		)).toBe("2026-09-19, 04:35 PM – 05:35 PM");
	});

	it("formats contextual timestamps and compact numbers", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-US" as const,
			timeZone: "UTC",
			numberNotation: "compact" as const,
		};
		expect(formatDisplayTimestamp(
			"2026-09-19T15:35:00Z",
			preferences,
			new Date("2026-09-19T16:35:00Z"),
		)).toBe("1 hour ago");
		expect(formatDisplayNumber(1_250_000, preferences, { maximumFractionDigits: 1 })).toBe("1.3M");
	});

	it("allows spelled-out compact units without changing the default shorthand", () => {
		const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale: "en-GB" as const };
		expect(formatDisplayNumber(501_000_000_000, preferences, {
			notation: "compact", compactDisplay: "long", maximumFractionDigits: 2,
		})).toBe("501 billion");
		expect(formatDisplayNumber(23_800_000_000_000, preferences, {
			notation: "compact", compactDisplay: "long", maximumFractionDigits: 2,
		})).toBe("23.8 trillion");
		expect(formatDisplayNumber(501_000_000_000, preferences, { notation: "compact" }))
			.toBe("501bn");
	});

	it("keeps date-only values on their canonical calendar day", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-US" as const,
			dateStyle: "long" as const,
			timeZone: "America/Los_Angeles",
		};
		expect(formatDisplayCalendarDate("2026-01-01T00:00:00Z", preferences))
			.toBe("January 1, 2026");
	});

	it("applies locale and clock preferences to custom date parts", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-GB" as const,
			timeZone: "Europe/London",
			hourCycle: "24h" as const,
		};
		expect(formatDisplayDateParts(
			"2026-09-19T16:35:00Z",
			preferences,
			{ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
		)).toBe("19 Sept, 17:35");
	});

	it("reuses formatters for repeated settings instead of rebuilding them per value", () => {
		const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale: "en-GB" as const, timeZone: "UTC" };
		const options = { month: "long", year: "numeric", timeZone: "UTC" } as const;
		const dateFormat = jest.spyOn(Intl, "DateTimeFormat");
		const numberFormat = jest.spyOn(Intl, "NumberFormat");
		try {
			const months = Array.from({ length: 200 }, (_, index) =>
				formatDisplayDateParts(Date.UTC(2026, index % 12, 15), preferences, options));
			const numbers = Array.from({ length: 200 }, (_, index) => formatDisplayNumber(index * 1_000, preferences));
			expect(months[0]).toBe("January 2026");
			expect(months[11]).toBe("December 2026");
			expect(numbers[2]).toBe("2,000");
			expect(dateFormat.mock.calls.length).toBeLessThanOrEqual(1);
			expect(numberFormat.mock.calls.length).toBeLessThanOrEqual(1);
			// Different settings still get their own formatter.
			expect(formatDisplayDateParts(Date.UTC(2026, 0, 15), { ...preferences, locale: "fr-FR" as const }, options)).toBe("janvier 2026");
		} finally {
			dateFormat.mockRestore();
			numberFormat.mockRestore();
		}
	});

	it("allows exact values to override compact notation", () => {
		const preferences = {
			...DEFAULT_DISPLAY_PREFERENCES,
			locale: "en-US" as const,
			numberNotation: "compact" as const,
		};
		expect(formatDisplayNumber(1_250_000, preferences, { notation: "standard" }))
			.toBe("1,250,000");
	});

	it.each(["en-GB", "de-DE", "fr-FR", "ja-JP"])("formats money in US format under %s", (locale) => {
		const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale };
		const usd = { style: "currency", currency: "USD" } as const;
		expect(formatDisplayNumber(12.5, preferences, usd)).toBe("$12.50");
		expect(formatDisplayNumber(1_234.5, preferences, usd)).toBe("$1,234.50");
		expect(formatDisplayNumber(-3, preferences, usd)).toBe("-$3.00");
		expect(formatDisplayNumber(0.004, preferences, { ...usd, minimumFractionDigits: 4 })).toBe("$0.0040");
	});

	it("keeps plain numbers in the user's locale", () => {
		const preferences = { ...DEFAULT_DISPLAY_PREFERENCES, locale: "de-DE" };
		expect(formatDisplayNumber(1_234.5, preferences)).toBe("1.234,5");
		expect(formatDisplayNumber(0.25, preferences, { style: "percent" })).toMatch(/^25\s%$/);
	});

	it("normalizes appearance preferences and chooses a readable accent foreground", () => {
		expect(normalizeDisplayPreferences({
			...DEFAULT_DISPLAY_PREFERENCES,
			lightPalette: "warm",
			darkPalette: "midnight",
			lightAccent: "#7C3AED",
			darkAccent: "invalid",
		})).toMatchObject({
			lightPalette: "warm",
			darkPalette: "midnight",
			lightAccent: "#7c3aed",
			darkAccent: DEFAULT_DISPLAY_PREFERENCES.darkAccent,
		});
		expect(readableForegroundForAccent("#111111")).toBe("#ffffff");
		expect(readableForegroundForAccent("#facc15")).toBe("#0b0b0b");
	});
});
