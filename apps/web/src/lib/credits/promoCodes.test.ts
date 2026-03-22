import {
	defaultRedeemMessageForStatus,
	getCreditTransactionKindLabel,
	isPromoCodeFormatValid,
	normalizePromoCodeInput,
	resolveRedeemMessage,
} from "./promoCodes";

describe("promo code helpers", () => {
	it("normalizes promo codes to uppercase", () => {
		expect(normalizePromoCodeInput(" errors_10 ")).toBe("ERRORS_10");
	});

	it("validates promo code format", () => {
		expect(isPromoCodeFormatValid("ERRORS")).toBe(true);
		expect(isPromoCodeFormatValid("SORRY-25")).toBe(true);
		expect(isPromoCodeFormatValid("a")).toBe(false);
		expect(isPromoCodeFormatValid("bad code")).toBe(false);
	});

	it("maps redeem statuses to fallback messages", () => {
		expect(defaultRedeemMessageForStatus("invoice_mode")).toBe(
			"Credit codes are not available for invoice billing teams."
		);
		expect(defaultRedeemMessageForStatus("maxed_out")).toBe(
			"This code isn't available any more."
		);
		expect(defaultRedeemMessageForStatus("already_redeemed")).toBe(
			"You have already redeemed this credit code."
		);
	});

	it("prefers DB-provided messages when available", () => {
		expect(resolveRedeemMessage("not_found", "  Custom error  ")).toBe(
			"Custom error"
		);
		expect(resolveRedeemMessage("not_found", "")).toBe(
			"This credit code is invalid."
		);
		expect(resolveRedeemMessage("maxed_out", "This credit code has expired.")).toBe(
			"This code isn't available any more."
		);
	});

	it("maps promo_code transactions to Promo Credit", () => {
		expect(getCreditTransactionKindLabel("promo_code")).toBe("Promo Credit");
	});
});
