import { MONEY_LOCALE } from "@/lib/displayPreferences";

/** The consent screen's default monthly spending limit for a third-party app, in US dollars. */
export const DEFAULT_CONSENT_SPEND_LIMIT_USD = 20;
export const MIN_CONSENT_SPEND_LIMIT_USD = 0.01;
export const MAX_CONSENT_SPEND_LIMIT_USD = 1_000_000;
const NANOS_PER_CENT = 10_000_000;

const usd = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD" });

/** "$20.00": money reads in US format whatever the UI locale. */
export function formatConsentSpendLimit(amountUsd: number): string {
	return usd.format(amountUsd);
}

/**
 * The amount typed on the consent screen, in nanodollars (whole cents), or null unless it is
 * $0.01 to $1,000,000.00. "No limit" is a separate choice, sent as 0.
 */
export function parseConsentSpendLimit(input: string): number | null {
	const text = input.trim().replace(/^\$\s*/, "").replace(/,/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
	const cents = Math.round(Number(text) * 100);
	if (!Number.isSafeInteger(cents) || cents < MIN_CONSENT_SPEND_LIMIT_USD * 100 || cents > MAX_CONSENT_SPEND_LIMIT_USD * 100) return null;
	return cents * NANOS_PER_CENT;
}
