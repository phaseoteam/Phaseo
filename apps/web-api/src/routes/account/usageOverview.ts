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

const BUCKETS = new Set<string>(["5 minutes", "hour", "day", "month"]);
const HOUR_MS = 3_600_000;

/**
 * The bucket a window's charts use: the requested one when valid, otherwise
 * the one the overview picks for a window that long.
 */
export function usageOverviewBucket(from: string, to: string, requested: string | null): UsageOverviewBucket {
	if (requested && BUCKETS.has(requested)) return requested as UsageOverviewBucket;
	const hours = Math.max(1, (Date.parse(to) - Date.parse(from)) / HOUR_MS);
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
