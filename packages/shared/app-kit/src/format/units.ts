// Speed, latency and token limits, one style each everywhere, set on 2026-10-29: speed in tps, latency in seconds
// (milliseconds only for small internal timings such as gateway overhead), token limits in full where there's room.
// The numbers follow the model page's provider cards (components/(data)/model/pricing/ProviderCard.tsx).

const fixedFormatters = new Map<string, Intl.NumberFormat>();

function fixed(value: number, digits: number, locale: string): string {
	const key = `${locale}|${digits}`;
	let formatter = fixedFormatters.get(key);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
		fixedFormatters.set(key, formatter);
	}
	return formatter.format(value);
}

/**
 * Output speed in tokens per second: "45.3 tps", "123 tps", "1,234 tps". One place below 100, none from 100. Null
 * when there's no reading, so each place keeps its own placeholder.
 */
export function formatTps(value: number | null | undefined, locale = "en-GB"): string | null {
	if (value == null || !Number.isFinite(value)) return null;
	const speed = Math.max(0, value);
	return `${fixed(speed, speed >= 100 ? 0 : 1, locale)} tps`;
}

/**
 * A latency in seconds, from milliseconds: "0.85 s", "12.3 s", "125 s", then minutes above 1,000 seconds ("16.7 min").
 * Time to first token, end-to-end latency and how long a response took all use it. Null when there's no reading.
 */
export function formatLatency(milliseconds: number | null | undefined, locale = "en-GB"): string | null {
	if (milliseconds == null || !Number.isFinite(milliseconds)) return null;
	const seconds = Math.max(0, milliseconds) / 1_000;
	if (seconds > 1_000) {
		const minutes = seconds / 60;
		return `${fixed(minutes, minutes >= 100 ? 0 : 1, locale)} min`;
	}
	return `${fixed(seconds, seconds >= 100 ? 0 : seconds >= 10 ? 1 : 2, locale)} s`;
}

const wholeFormatters = new Map<string, Intl.NumberFormat>();

/** A context window or other token limit in full: "131,072 tokens", "1 token". */
export function formatTokenCount(value: number, locale = "en-GB"): string {
	let formatter = wholeFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
		wholeFormatters.set(locale, formatter);
	}
	return `${formatter.format(value)} ${value === 1 ? "token" : "tokens"}`;
}

/**
 * A token limit where space is short, such as a list row, a chip or a page title: "131K", "1M", "8K". Moved from the
 * website's formatContextLength (lib/models/modelDescription.ts).
 */
export function formatTokenCountShort(value: number): string {
	if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
	return String(Math.round(value));
}
