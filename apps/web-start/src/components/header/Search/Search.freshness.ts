export const SEARCH_REFRESH_AWAY_MS = 60 * 1_000;
export const SEARCH_REFRESH_INTERVAL_MS = 60 * 1_000;

export function wasAwayLongEnough(awaySince: number | null, now: number) {
	return awaySince !== null && now - awaySince >= SEARCH_REFRESH_AWAY_MS;
}

export function canRefreshSearchIndex(lastRefreshAt: number, now: number) {
	return lastRefreshAt === 0 || now - lastRefreshAt >= SEARCH_REFRESH_INTERVAL_MS;
}
