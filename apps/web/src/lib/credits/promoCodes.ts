export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

export function normalizePromoCodeInput(raw: string): string {
	return String(raw ?? "").trim().toUpperCase();
}

export function isPromoCodeFormatValid(raw: string): boolean {
	return PROMO_CODE_PATTERN.test(normalizePromoCodeInput(raw));
}

export type RedeemCreditCodeStatus =
	| "succeeded"
	| "unauthorized"
	| "team_forbidden"
	| "invoice_mode"
	| "invalid_code_format"
	| "not_found"
	| "inactive"
	| "expired"
	| "maxed_out"
	| "already_redeemed"
	| "wallet_not_found"
	| "error";

export function defaultRedeemMessageForStatus(status: string): string {
	switch (String(status ?? "").toLowerCase() as RedeemCreditCodeStatus) {
		case "succeeded":
			return "Promo credit applied successfully.";
		case "unauthorized":
			return "You must be signed in to redeem a credit code.";
		case "team_forbidden":
			return "You do not have access to that team.";
		case "invoice_mode":
			return "Credit codes are not available for invoice billing teams.";
		case "invalid_code_format":
			return "Credit code format is invalid.";
		case "not_found":
			return "This credit code is invalid.";
		case "inactive":
			return "This code isn't available any more.";
		case "expired":
			return "This code isn't available any more.";
		case "maxed_out":
			return "This code isn't available any more.";
		case "already_redeemed":
			return "You have already redeemed this credit code.";
		case "wallet_not_found":
			return "Wallet not found for this team.";
		default:
			return "We could not redeem that credit code right now.";
	}
}

export function resolveRedeemMessage(
	status: string,
	messageFromDb: string | null | undefined
): string {
	const normalized = String(status ?? "").toLowerCase();
	if (
		normalized === "inactive" ||
		normalized === "expired" ||
		normalized === "maxed_out"
	) {
		return defaultRedeemMessageForStatus(normalized);
	}

	const trimmed = String(messageFromDb ?? "").trim();
	return trimmed.length > 0
		? trimmed
		: defaultRedeemMessageForStatus(status);
}

export function getCreditTransactionKindLabel(
	kind: string | null | undefined
): string | null {
	const normalized = String(kind ?? "").toLowerCase();
	if (!normalized) return null;
	if (normalized === "promo_code") return "Promo Credit";
	if (normalized === "goodwill_credit") return "Goodwill Credit";
	if (normalized === "top_up_one_off") return "One-Off Top Up";
	if (normalized === "top_up") return "Top Up";
	if (normalized === "auto_top_up") return "Auto Top Up";
	if (normalized === "refund" || normalized === "refunded") return "Refund";
	if (normalized === "adjustment") return "Adjustment";
	if (normalized === "charge" || normalized === "usage") return "Usage";
	return null;
}
