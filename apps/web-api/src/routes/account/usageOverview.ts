/** One group of exact usage from `get_private_usage_overview`. */
export type UsageOverviewCell = {
	/** The bucket's start, or null when the window wasn't split into buckets. */
	bucket: string | null;
	modelId: string | null;
	provider: string | null;
	keyId: string | null;
	appId: string | null;
	byok: boolean;
	requests: number;
	successfulRequests: number;
	guardrailBlocked: number;
	costNanos: number;
	tokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	cachedTokens: number;
};

export type UsageOverviewBucket = "5 minutes" | "hour" | "day" | "month";

const HOUR_MS = 3_600_000;
/**
 * The longest window, in hours, each bucket may be requested for. 5-minute buckets
 * read every request rather than the rollup, and fine buckets over long windows
 * return a cell for every one.
 */
const MAX_BUCKET_HOURS: Record<UsageOverviewBucket, number> = {
	"5 minutes": 6,
	hour: 24 * 31,
	day: Number.POSITIVE_INFINITY,
	month: Number.POSITIVE_INFINITY,
};

/**
 * The bucket a window's charts use: the requested one when valid for a window
 * that long, otherwise the one the overview picks.
 */
export function usageOverviewBucket(from: string, to: string, requested: string | null): UsageOverviewBucket {
	const hours = Math.max(1, (Date.parse(to) - Date.parse(from)) / HOUR_MS);
	if (requested && Object.hasOwn(MAX_BUCKET_HOURS, requested) && hours <= MAX_BUCKET_HOURS[requested as UsageOverviewBucket]) {
		return requested as UsageOverviewBucket;
	}
	if (hours <= 2) return "5 minutes";
	if (hours <= 48) return "hour";
	if (hours <= 24 * 400) return "day";
	return "month";
}

/** An IANA time zone the reader's buckets are cut in; UTC when missing or unknown. */
export function usageOverviewTimeZone(value: string | null): string {
	if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return "UTC";
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return value;
	} catch {
		return "UTC";
	}
}

export type UsageLabelFacet = { key: string; value: string };

/**
 * Reads `get_private_usage_label_facets` output: the most used labels, which the
 * function caps, in key then value order for the label filter.
 */
export function parseUsageLabelFacets(value: unknown): UsageLabelFacet[] {
	return (Array.isArray(value) ? value : [])
		.flatMap((item): UsageLabelFacet[] => {
			const facet = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
			return typeof facet.key === "string" && typeof facet.value === "string" ? [{ key: facet.key, value: facet.value }] : [];
		})
		.sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value));
}

const count = (value: unknown) => {
	const number = Number(value ?? 0);
	return Number.isFinite(number) && number > 0 ? number : 0;
};
const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** Reads `get_private_usage_overview` output, dropping malformed cells. */
export function parseUsageOverviewCells(value: unknown): UsageOverviewCell[] {
	return (Array.isArray(value) ? value : []).flatMap((item): UsageOverviewCell[] => {
		if (!item || typeof item !== "object") return [];
		const cell = item as Record<string, unknown>;
		const bucket = text(cell.bucket);
		if (bucket !== null && !Number.isFinite(Date.parse(bucket))) return [];
		return [{
			bucket: bucket === null ? null : new Date(bucket).toISOString(),
			modelId: text(cell.modelId),
			provider: text(cell.provider),
			keyId: text(cell.keyId),
			appId: text(cell.appId),
			byok: cell.byok === true,
			requests: count(cell.requests),
			successfulRequests: count(cell.successfulRequests),
			guardrailBlocked: count(cell.guardrailBlocked),
			costNanos: count(cell.costNanos),
			tokens: count(cell.tokens),
			inputTokens: count(cell.inputTokens),
			outputTokens: count(cell.outputTokens),
			reasoningTokens: count(cell.reasoningTokens),
			cachedTokens: count(cell.cachedTokens),
		}];
	});
}
