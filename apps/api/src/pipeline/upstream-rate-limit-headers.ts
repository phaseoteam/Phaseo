// Purpose: Safely normalize upstream rate-limit metadata for gateway clients.
// Why: Retry guidance is useful downstream, but provider headers may contain
// shared-account capacity or unrelated sensitive metadata.

// Ceiling for Retry-After values copied from a provider response (added with
// the safe upstream rate-limit headers): a provider value beyond a day is
// treated as untrusted and dropped rather than passed on to the client.
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;
const MAX_QUOTA_VALUE_LENGTH = 128;

const QUOTA_HEADER_MAP = [
	["ratelimit-limit", "X-Phaseo-Upstream-RateLimit-Limit"],
	["ratelimit-remaining", "X-Phaseo-Upstream-RateLimit-Remaining"],
	["ratelimit-reset", "X-Phaseo-Upstream-RateLimit-Reset"],
	["x-ratelimit-limit", "X-Phaseo-Upstream-RateLimit-Limit"],
	["x-ratelimit-remaining", "X-Phaseo-Upstream-RateLimit-Remaining"],
	["x-ratelimit-reset", "X-Phaseo-Upstream-RateLimit-Reset"],
	["x-ratelimit-limit-requests", "X-Phaseo-Upstream-RateLimit-Limit-Requests"],
	["x-ratelimit-remaining-requests", "X-Phaseo-Upstream-RateLimit-Remaining-Requests"],
	["x-ratelimit-reset-requests", "X-Phaseo-Upstream-RateLimit-Reset-Requests"],
	["x-ratelimit-limit-tokens", "X-Phaseo-Upstream-RateLimit-Limit-Tokens"],
	["x-ratelimit-remaining-tokens", "X-Phaseo-Upstream-RateLimit-Remaining-Tokens"],
	["x-ratelimit-reset-tokens", "X-Phaseo-Upstream-RateLimit-Reset-Tokens"],
] as const;

export const EXPOSED_UPSTREAM_RATE_LIMIT_HEADERS = [
	"Retry-After",
	...Array.from(new Set(QUOTA_HEADER_MAP.map(([, downstream]) => downstream))),
];

function normalizeRetryAfter(
	value: string | null,
	nowMs = Date.now(),
	maxSeconds = MAX_RETRY_AFTER_SECONDS,
): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		const seconds = Number(trimmed);
		if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > maxSeconds) return null;
		return String(seconds);
	}

	const retryAtMs = Date.parse(trimmed);
	if (!Number.isFinite(retryAtMs)) return null;
	const seconds = Math.ceil((retryAtMs - nowMs) / 1000);
	if (seconds < 0 || seconds > maxSeconds) return null;
	return String(seconds);
}

function normalizeQuotaValue(value: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > MAX_QUOTA_VALUE_LENGTH) return null;
	// Rate-limit values are counts, timestamps, or compact durations. Requiring
	// a leading digit prevents arbitrary provider text from becoming a header.
	if (!/^[0-9][0-9A-Za-z.,:+\- ]*$/.test(trimmed)) return null;
	return trimmed;
}

export function extractDownstreamRateLimitHeaders(
	upstreamHeaders: Headers,
	options: { includeQuotaDetails: boolean },
): Record<string, string> {
	const downstream: Record<string, string> = {};
	const retryAfter = normalizeRetryAfter(upstreamHeaders.get("retry-after"));
	if (retryAfter != null) {
		downstream["Retry-After"] = retryAfter;
	}

	if (!options.includeQuotaDetails) return downstream;

	for (const [upstreamName, downstreamName] of QUOTA_HEADER_MAP) {
		if (downstream[downstreamName] != null) continue;
		const value = normalizeQuotaValue(upstreamHeaders.get(upstreamName));
		if (value != null) downstream[downstreamName] = value;
	}
	return downstream;
}

/**
 * Reads the rate-limit headers a gateway response already carries in their
 * downstream form: `Retry-After` and the `X-Phaseo-Upstream-RateLimit-*`
 * quota headers, which the execute stage only sets for BYOK attempts. Provider
 * header names are not read, so a raw upstream response cannot leak a shared
 * account's quota through this path.
 */
export function readDownstreamRateLimitHeaders(
	responseHeaders: Headers,
	options: { gatewayOriginated?: boolean } = {},
): Record<string, string> {
	const downstream: Record<string, string> = {};
	// A gateway-originated limit (an API key's monthly spend cap, a spend rule
	// block) knows its own reset time, which can be weeks away. The 24-hour
	// ceiling is only for provider values, so these keep the full delay.
	const retryAfter = normalizeRetryAfter(
		responseHeaders.get("retry-after"),
		Date.now(),
		options.gatewayOriginated ? Number.MAX_SAFE_INTEGER : MAX_RETRY_AFTER_SECONDS,
	);
	if (retryAfter != null) downstream["Retry-After"] = retryAfter;
	for (const name of EXPOSED_UPSTREAM_RATE_LIMIT_HEADERS) {
		if (name === "Retry-After") continue;
		const value = normalizeQuotaValue(responseHeaders.get(name));
		if (value != null) downstream[name] = value;
	}
	return downstream;
}

export function applyDownstreamRateLimitHeaders(
	responseHeaders: Headers,
	headers: Record<string, unknown> | null | undefined,
): void {
	if (!headers) return;
	for (const allowedName of EXPOSED_UPSTREAM_RATE_LIMIT_HEADERS) {
		const value = headers[allowedName];
		if (typeof value === "string" && value.length > 0) responseHeaders.set(allowedName, value);
	}
}
