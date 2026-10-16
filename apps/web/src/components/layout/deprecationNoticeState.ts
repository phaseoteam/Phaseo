import type { DeprecationWarning } from "@/lib/fetchers/usage/types";

// A dismissal holds until the model's lifecycle dates change, so the notice is
// never repeated for the same deprecation.
export function deprecationNoticeKey(warning: DeprecationWarning) {
	return `${warning.modelId}:${warning.deprecationDate ?? ""}:${warning.retirementDate ?? ""}`;
}

export function visibleDeprecationWarnings(warnings: DeprecationWarning[], dismissed: ReadonlySet<string>) {
	return warnings.filter((warning) => warning.countAsAlert && !dismissed.has(deprecationNoticeKey(warning)));
}

// Signed-in page views reuse the last answer for a few hours instead of
// querying usage on every navigation.
export const DEPRECATION_NOTICE_REFRESH_MS = 6 * 60 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 60_000;

export type CachedDeprecationWarnings = { fetchedAt: number; warnings: DeprecationWarning[] };

export function isCachedDeprecationNoticeFresh(cached: CachedDeprecationWarnings | null | undefined, now: number): cached is CachedDeprecationWarnings {
	return Boolean(cached && Number.isFinite(cached.fetchedAt) && cached.fetchedAt <= now && now - cached.fetchedAt < DEPRECATION_NOTICE_REFRESH_MS);
}

/** Time until cached warnings expire, measured from when they were fetched. */
export function deprecationNoticeStaleIn(cached: CachedDeprecationWarnings | null | undefined, now: number) {
	return isCachedDeprecationNoticeFresh(cached, now) ? cached.fetchedAt + DEPRECATION_NOTICE_REFRESH_MS - now : 0;
}

/** Schedules the next check at expiry, never sooner than a minute. */
export function deprecationNoticeRefreshDelay(cached: CachedDeprecationWarnings | null | undefined, now: number) {
	return Math.max(MIN_REFRESH_DELAY_MS, deprecationNoticeStaleIn(cached, now));
}

export function fillNoticeTemplate(template: string, values: Record<string, string>) {
	return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
