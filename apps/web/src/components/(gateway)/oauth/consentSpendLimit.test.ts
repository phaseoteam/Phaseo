import {
	DEFAULT_CONSENT_SPEND_LIMIT_USD,
	checkConsentSpendLimit,
	formatConsentSpendLimit,
	formatConsentSpendLimitInput,
	parseConsentSpendLimit,
} from "./consentSpendLimit";

describe("consent spending limit", () => {
	it("defaults to $20.00 a month, shown in US format", () => {
		expect(formatConsentSpendLimit(DEFAULT_CONSENT_SPEND_LIMIT_USD)).toBe("$20.00");
		expect(formatConsentSpendLimit(1234.5)).toBe("$1,234.50");
		expect(parseConsentSpendLimit(DEFAULT_CONSENT_SPEND_LIMIT_USD.toFixed(2))).toBe(20_000_000_000);
	});

	it("reads plain numbers, US decimals and correct US thousands grouping as whole cents of nanodollars", () => {
		expect(parseConsentSpendLimit("20")).toBe(20_000_000_000);
		expect(parseConsentSpendLimit("20.5")).toBe(20_500_000_000);
		expect(parseConsentSpendLimit("20.00")).toBe(20_000_000_000);
		expect(parseConsentSpendLimit("1,000")).toBe(1_000_000_000_000);
		expect(parseConsentSpendLimit("1,000.50")).toBe(1_000_500_000_000);
		expect(parseConsentSpendLimit(" $35.5 ")).toBe(35_500_000_000);
		expect(parseConsentSpendLimit("0.01")).toBe(10_000_000);
		expect(parseConsentSpendLimit("1000000")).toBe(1_000_000_000_000_000);
		expect(parseConsentSpendLimit("1,000,000.00")).toBe(1_000_000_000_000_000);
	});

	it("refuses decimal commas and wrong grouping instead of misreading them", () => {
		for (const input of ["20,00", "0,01", "20,5", "1.000,50", "1,00,000", "1,0000", "10,00.50", ",100", "1,", "20.", ".5", "1.005", "abc", "20 USD", "1e3", "-5"]) {
			expect({ input, check: checkConsentSpendLimit(input) }).toEqual({ input, check: { ok: false, reason: "format" } });
			expect(parseConsentSpendLimit(input)).toBeNull();
		}
	});

	it("refuses amounts outside $0.01 to $1,000,000.00", () => {
		for (const input of ["", "0", "0.00", "1000000.01", "1,000,001"]) {
			expect({ input, check: checkConsentSpendLimit(input) }).toEqual({ input, check: { ok: false, reason: "range" } });
		}
	});

	it("shows an accepted amount the way it was read", () => {
		expect(formatConsentSpendLimitInput(parseConsentSpendLimit("1000.5")!)).toBe("1,000.50");
		expect(formatConsentSpendLimitInput(parseConsentSpendLimit("20")!)).toBe("20.00");
		expect(formatConsentSpendLimitInput(parseConsentSpendLimit("$1,000,000")!)).toBe("1,000,000.00");
	});
});
