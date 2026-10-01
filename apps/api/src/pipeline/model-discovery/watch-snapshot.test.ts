import { describe, expect, it, vi } from "vitest";
import { supplementalProviderPricing, toPricingFingerprint } from "./watch-snapshot";

describe("supplemental pricing canonicalization", () => {
	it("serializes each array item once while preserving canonical order", () => {
		const prices = Array.from({ length: 100 }, (_, index) => ({ hourly: 100 - index }));
		const expected = [...prices].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		const stringify = vi.spyOn(JSON, "stringify");
		let result: unknown;
		try {
			result = supplementalProviderPricing(prices, "pricing");
			expect(stringify).toHaveBeenCalledTimes(prices.length);
		} finally {
			stringify.mockRestore();
		}
		expect(result).toEqual(expected);
	});

	it("ignores array ordering and timestamps but detects supplemental price changes", () => {
		const fingerprint = (value: unknown) => toPricingFingerprint(supplementalProviderPricing(value));
		const original = { pricing: [{ hourly: 2, updated_at: "yesterday" }, { hourly: 1 }] };
		expect(fingerprint(original)).toBe(fingerprint({ pricing: [{ hourly: 1 }, { updated_at: "today", hourly: 2 }] }));
		expect(fingerprint(original)).not.toBe(fingerprint({ pricing: [{ hourly: 1 }, { hourly: 3 }] }));
	});
});
