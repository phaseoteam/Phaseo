// Number and date formatting for entity cards. Money is always US dollars in
// the US style ("$12.50"). A published price is shown with every digit it was
// published with, so it is never rounded up against the customer and a cheap
// rate never reads as free.

/** Decimal places in the shortest form of a number ("0.0004255" → 7, "4.2e-7" → 8). */
function decimalPlaces(value: number): number {
	const [mantissa, exponent] = String(value).toLowerCase().split("e");
	const fraction = mantissa.split(".")[1]?.length ?? 0;
	return Math.max(0, fraction - Number(exponent ?? 0));
}

/** "$8", "$12.50", "$0.075", "$0.01049", "$0.0004255". */
export function formatUsd(value: number | null | undefined): string | null {
	if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
	// Drop binary floating-point noise (0.1 + 0.2) without touching published digits.
	const price = Number(value.toPrecision(12));
	const decimals = Math.min(20, decimalPlaces(price));
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: "standard",
		// Whole dollars stay whole ("$8"); anything else shows cents at least ("$12.50").
		minimumFractionDigits: decimals === 0 ? 0 : 2,
		maximumFractionDigits: Math.max(2, decimals),
	}).format(price);
}

/**
 * Context windows in compact form: "1M", "1.05M", "131K". The K/M suffixes are
 * the token units used across the catalogue, so they stay the same in every
 * locale (locale compact notation would give "1m" in en-GB).
 */
export function formatTokensCompact(value: number | null | undefined, locale: string): string | null {
	if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
	const number = (amount: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(amount);
	if (value >= 1_000_000) return `${number(value / 1_000_000, 2)}M`;
	if (value >= 1_000) return `${number(value / 1_000, 0)}K`;
	return number(value, 0);
}

/**
 * A percentage to one decimal, rounded down so 99.99% (a failure happened)
 * never shows as 100.0%.
 */
export function formatPercentFloor(value: number | null | undefined, locale: string): string | null {
	if (value === null || value === undefined || !Number.isFinite(value)) return null;
	const floored = Math.floor(value * 10) / 10;
	return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(floored / 100);
}

/** Token shares: one decimal, or "<0.1%" for tiny shares. */
export function formatShare(value: number | null | undefined, locale: string): string | null {
	if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
	const format = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
	return value < 0.1 ? `<${format.format(0.001)}` : format.format(value / 100);
}

/** A signed rank change: "+2", "−1", "0". */
export function formatRankChange(value: number | null | undefined, locale: string): string | null {
	if (value === null || value === undefined || !Number.isFinite(value)) return null;
	return new Intl.NumberFormat(locale, { signDisplay: "exceptZero" }).format(value);
}

/** A calendar date ("9 Nov 2026" in en-GB), read as UTC so it never shifts a day. */
export function formatCardDate(value: string | null | undefined, locale: string): string | null {
	if (!value) return null;
	const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
	if (!Number.isFinite(time)) return null;
	return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(time);
}

export function countryName(code: string | null | undefined, locale: string): string | null {
	if (!code) return null;
	try {
		return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
	} catch {
		return code;
	}
}
