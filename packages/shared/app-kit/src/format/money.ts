/** Money is always shown the US way ("$12.50", never "US$12.50"), whatever language the rest of the app uses. */
export const MONEY_LOCALE = "en-US";

const usdCents = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdBelowCent = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * An amount of money: a balance, spend, a budget or a usage total. "$12.50" and "$1,234.50", with up to four places
 * below a cent ("$0.0035"). The website's budgets style (useSpendUsd in settings/spend-rules/spendAlertsUi.tsx).
 * A missing amount is "—".
 */
export function formatUsd(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return (value > 0 && value < 0.01 ? usdBelowCent : usdCents).format(value);
}

/**
 * What one request, message or chat cost, with trailing zeros dropped: "$0", "$0.00004", "$0.1234", "$0.5". Six places
 * below a cent and nine below a thousandth of a cent, so a small cost never looks free. The website's chat style.
 * Null for a negative or unreadable cost.
 */
export function formatUsdCost(value: unknown): string | null {
	const amount =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number.parseFloat(value)
				: NaN;
	if (!Number.isFinite(amount) || amount < 0) return null;
	if (amount === 0) return "$0";
	if (amount >= 0.01) {
		return `$${amount.toFixed(4).replace(/\.?0+$/, "")}`;
	}
	if (amount >= 0.00001) {
		return `$${amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
	}
	return `$${amount.toFixed(9).replace(/0+$/, "").replace(/\.$/, "")}`;
}

const priceFormatters = new Map<number, Intl.NumberFormat>();

/**
 * A unit price, such as per million tokens: "$0.0035", "$0.035", "$2.5", "$1,234.5". The website's /models list style
 * (formatPrice in components/(data)/models/Models/ModelCard.tsx): four places below a tenth of a cent, three below ten
 * cents, otherwise two, with trailing zeros dropped. Zero is "$0" with `allowZero`; otherwise it is null, like a
 * negative or missing price.
 */
export function formatUsdPrice(value: number | null | undefined, options: { allowZero?: boolean } = {}): string | null {
	if (value == null || !Number.isFinite(value) || value < 0) return null;
	if (value === 0) return options.allowZero ? "$0" : null;
	const maximumFractionDigits = value < 0.001 ? 4 : value < 0.1 ? 3 : 2;
	let formatter = priceFormatters.get(maximumFractionDigits);
	if (!formatter) {
		formatter = new Intl.NumberFormat(MONEY_LOCALE, { maximumFractionDigits });
		priceFormatters.set(maximumFractionDigits, formatter);
	}
	return `$${formatter.format(value)}`;
}

const headlineSmall = new Intl.NumberFormat(MONEY_LOCALE, { maximumSignificantDigits: 3 });
const headlineWhole = new Intl.NumberFormat(MONEY_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const headlineCents = new Intl.NumberFormat(MONEY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * A model's headline price per million tokens: "$15", "$0.50", "$0.035", and three significant digits below a cent
 * ("$0.0035") so a small rate never looks free. The website's /models card headline (formatHeadlinePrice in
 * components/(data)/models/Models/ModelCard.tsx).
 */
export function formatUsdHeadlinePrice(value: number): string {
	if (value === 0) return "$0";
	if (value < 0.01) return `$${headlineSmall.format(value)}`;
	const integer = Math.abs(value - Math.round(value)) < 1e-9;
	return `$${(integer ? headlineWhole : headlineCents).format(value)}`;
}
