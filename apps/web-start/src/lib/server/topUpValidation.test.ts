import {
	isValidTopUpAmountPence,
	isSupportedTopUpSettlement,
	MAX_TOP_UP_PENCE,
	MIN_TOP_UP_PENCE,
} from "./topUpValidation";

describe("isValidTopUpAmountPence", () => {
	it("accepts the documented purchase range", () => {
		expect(isValidTopUpAmountPence(MIN_TOP_UP_PENCE)).toBe(true);
		expect(isValidTopUpAmountPence(MAX_TOP_UP_PENCE)).toBe(true);
	});

	it.each([499, 100_000_001, 500.5, Number.NaN, Number.POSITIVE_INFINITY])(
		"rejects invalid amount %s",
		(value) => expect(isValidTopUpAmountPence(value)).toBe(false),
	);

	it("only accepts USD settlements for dollar-denominated credits", () => {
		expect(isSupportedTopUpSettlement("usd", 500)).toBe(true);
		expect(isSupportedTopUpSettlement("USD", 500)).toBe(true);
		expect(isSupportedTopUpSettlement("jpy", 500)).toBe(false);
	});
});
