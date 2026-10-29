/**
 * Counts of tokens, requests and the like, as the website shows them: rounded down to two places with an English
 * suffix ("49.91M", "1.15K", "1.99B"), so a count is never shown higher than it is. Other locales get Intl's compact
 * form. Moved from apps/web/src/lib/formatRoundedCount.ts, which re-exports it.
 */
const COUNT_UNITS = [
	[1e33, "Dc"],
	[1e30, "No"],
	[1e27, "Oc"],
	[1e24, "Sp"],
	[1e21, "Sx"],
	[1e18, "Qi"],
	[1e15, "Qa"],
	[1e12, "T"],
	[1e9, "B"],
	[1e6, "M"],
	[1e3, "K"],
] as const;

export function formatRoundedCount(value: number, locale?: string): string {
	if (!Number.isFinite(value)) return "--";

	for (const [threshold, suffix] of COUNT_UNITS) {
		if (value >= threshold) {
			if (locale && !locale.startsWith("en")) return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2, roundingMode: "floor" }).format(value);
			// Floored here as well as by roundingMode, which Hermes (the mobile app's engine) ignores. toPrecision drops
			// the float error in, say, 1.15 * 100 = 114.999…, which would otherwise floor to 1.14.
			const floored = Math.floor(Number(((value / threshold) * 100).toPrecision(15))) / 100;
			const rounded = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2, roundingMode: "floor" }).format(floored);
			return `${rounded}${suffix}`;
		}
	}

	return Math.floor(value).toLocaleString(locale);
}

export function formatCompactAxisTick(value: number, locale?: string): string {
	if (!Number.isFinite(value)) return "--";

	for (const [threshold, suffix] of COUNT_UNITS) {
		if (value >= threshold) {
			if (locale && !locale.startsWith("en")) return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 20 }).format(value);
			return `${locale ? new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(value / threshold) : value / threshold}${suffix}`;
		}
	}

	return locale ? new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 }).format(value) : String(value);
}
