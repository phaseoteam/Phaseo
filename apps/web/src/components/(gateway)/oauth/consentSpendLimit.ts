import { MONEY_LOCALE } from "@/lib/displayPreferences";

/** The consent screen's default monthly spending limit for a third-party app, in US dollars. */
export const DEFAULT_CONSENT_SPEND_LIMIT_USD = 20;
export const MIN_CONSENT_SPEND_LIMIT_USD = 0.01;
export const MAX_CONSENT_SPEND_LIMIT_USD = 1_000_000;
const NANOS_PER_CENT = 10_000_000;

const usd = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD" });
const usdAmount = new Intl.NumberFormat(MONEY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Plain digits ("1000", "20.5") or correct US thousands grouping ("1,000", "1,000.50"); at most two
// decimals, after a point. A decimal comma ("20,00") is refused rather than read as thousands.
const PLAIN_AMOUNT = /^\d+(?:\.\d{1,2})?$/;
const GROUPED_AMOUNT = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/;

/** "$20.00": money reads in US format whatever the UI locale. */
export function formatConsentSpendLimit(amountUsd: number): string {
	return usd.format(amountUsd);
}

/** The amount as the field shows it, beside its "$": "20.00", "1,000.50". */
export function formatConsentSpendLimitInput(nanos: number): string {
	return usdAmount.format(nanos / NANOS_PER_CENT / 100);
}

export type ConsentSpendLimitCheck =
	| { ok: true; nanos: number }
	| { ok: false; reason: "format" | "range" };

/**
 * Reads the amount typed on the consent screen as whole cents of nanodollars. It must be a US amount
 * (an optional "$", then "20", "20.5", "20.00", "1,000" or "1,000.50") from $0.01 to $1,000,000.00.
 * "No limit" is a separate choice, sent as 0.
 */
export function checkConsentSpendLimit(input: string): ConsentSpendLimitCheck {
	const text = input.trim().replace(/^\$\s*/, "");
	if (!text) return { ok: false, reason: "range" };
	if (!PLAIN_AMOUNT.test(text) && !GROUPED_AMOUNT.test(text)) return { ok: false, reason: "format" };
	const [dollars, fraction = ""] = text.replace(/,/g, "").split(".");
	const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
	if (!Number.isSafeInteger(cents) || cents < MIN_CONSENT_SPEND_LIMIT_USD * 100 || cents > MAX_CONSENT_SPEND_LIMIT_USD * 100) {
		return { ok: false, reason: "range" };
	}
	return { ok: true, nanos: cents * NANOS_PER_CENT };
}

/** The amount in nanodollars, or null unless it is a valid US amount from $0.01 to $1,000,000.00. */
export function parseConsentSpendLimit(input: string): number | null {
	const check = checkConsentSpendLimit(input);
	return check.ok ? check.nanos : null;
}
