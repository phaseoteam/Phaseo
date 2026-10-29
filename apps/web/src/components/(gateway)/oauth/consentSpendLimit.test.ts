import {
	DEFAULT_CONSENT_SPEND_LIMIT_USD,
	formatConsentSpendLimit,
	parseConsentSpendLimit,
} from "./consentSpendLimit";

describe("consent spending limit", () => {
	it("defaults to $20.00 a month, shown in US format", () => {
		expect(formatConsentSpendLimit(DEFAULT_CONSENT_SPEND_LIMIT_USD)).toBe("$20.00");
		expect(formatConsentSpendLimit(1234.5)).toBe("$1,234.50");
		expect(parseConsentSpendLimit(DEFAULT_CONSENT_SPEND_LIMIT_USD.toFixed(2))).toBe(20_000_000_000);
	});

	it("turns a typed amount into whole cents of nanodollars", () => {
		expect(parseConsentSpendLimit("20")).toBe(20_000_000_000);
		expect(parseConsentSpendLimit(" $35.5 ")).toBe(35_500_000_000);
		expect(parseConsentSpendLimit("1,000.01")).toBe(1_000_010_000_000);
		expect(parseConsentSpendLimit("0.01")).toBe(10_000_000);
		expect(parseConsentSpendLimit("1000000")).toBe(1_000_000_000_000_000);
	});

	it("refuses amounts that aren't $0.01 to $1,000,000.00", () => {
		for (const input of ["", "0", "0.00", "-5", "1.005", "abc", "20 USD", "1000000.01", "1e3"]) {
			expect(parseConsentSpendLimit(input)).toBeNull();
		}
	});
});
