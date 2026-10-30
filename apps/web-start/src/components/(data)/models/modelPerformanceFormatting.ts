import { formatLatency } from "@phaseo/app-kit/format";

/** A provider's latency in seconds ("5.31 s", "16.7 min"): app-kit's formatLatency, shared with the apps. */
export function formatProviderDuration(valueMs: number | null, locale?: string): string {
	return formatLatency(valueMs, locale) ?? "-";
}
