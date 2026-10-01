import { billingUnit, rebasePrice, validatePriceAmounts } from "./pricingPresentation";

describe("pricing amounts", () => {
	it("preserves the rate when switching billing quantities", () => {
		expect(rebasePrice("10", "1000000", "1000")).toBe("0.01");
		expect(rebasePrice("0.01", "1000", "1000000")).toBe("10");
		expect(rebasePrice("", "1", "1000")).toBe("");
	});
	it("distinguishes a free charge from a missing price", () => {
		expect(() => validatePriceAmounts([{ price_usd: "0", unit_quantity: "1" }])).not.toThrow();
		for (const price_usd of ["", " ", "-1", "NaN", "Infinity"]) {
			expect(() => validatePriceAmounts([{ price_usd, unit_quantity: "1" }])).toThrow();
		}
	});
	it("rejects empty charges and invalid quantities", () => {
		expect(() => validatePriceAmounts([])).toThrow();
		for (const unit_quantity of ["", "0", "-1", "NaN"]) {
			expect(() => validatePriceAmounts([{ price_usd: "10", unit_quantity }])).toThrow();
		}
	});
	it("labels token and request quantities", () => {
		expect(billingUnit("1000000", "token")).toBe("1M tokens");
		expect(billingUnit("1", "request")).toBe("1 request");
	});
});
