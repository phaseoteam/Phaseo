import { nanosToUsd, usdToNanos } from "./providerPricing";

test("shows and saves USD prices without losing fractional nanos", () => {
	for (const nanos of [0, 1, 100_000_000, 300_000_000, 8_123_456_789]) {
		expect(usdToNanos(nanosToUsd(nanos))).toBe(nanos);
	}
});

test("rejects blank, negative, excess precision and unsafe prices", () => {
	for (const value of ["", "-1", "0.0000000001", "1e3", "9007199.254740992"]) {
		expect(usdToNanos(value)).toBeNull();
	}
});
