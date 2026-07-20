export const SEARCH_REFRESH_AWAY_MS = 5 * 60 * 1_000;
export const SEARCH_GENERATION_CHECK_INTERVAL_MS = 15 * 60 * 1_000;

export function wasAwayLongEnough(awaySince: number | null, now: number) {
	return awaySince !== null && now - awaySince >= SEARCH_REFRESH_AWAY_MS;
}

export function canCheckSearchGeneration(lastCheckAt: number, now: number) {
	return lastCheckAt === 0 || now - lastCheckAt >= SEARCH_GENERATION_CHECK_INTERVAL_MS;
}

export function searchIndexPath(generation?: number) {
	return generation
		? `/api/_web/search?generation=${encodeURIComponent(generation)}`
		: "/api/_web/search";
}
