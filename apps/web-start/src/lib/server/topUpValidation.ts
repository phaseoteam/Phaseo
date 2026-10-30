export const TOP_UP_CURRENCY = "usd" as const;
export const MIN_TOP_UP_PENCE = 500;
export const MAX_TOP_UP_PENCE = 100_000_000;

export function isValidTopUpAmountPence(value: unknown): value is number {
	return typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value >= MIN_TOP_UP_PENCE &&
		value <= MAX_TOP_UP_PENCE;
}

export function isSupportedTopUpSettlement(currency: unknown, amountPence: unknown): amountPence is number {
	return typeof currency === "string" &&
		currency.toLowerCase() === TOP_UP_CURRENCY &&
		isValidTopUpAmountPence(amountPence);
}
