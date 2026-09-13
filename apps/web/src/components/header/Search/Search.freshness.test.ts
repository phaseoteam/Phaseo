import {
	canRefreshSearchIndex,
	SEARCH_REFRESH_INTERVAL_MS,
	SEARCH_REFRESH_AWAY_MS,
	wasAwayLongEnough,
} from "./Search.freshness";

describe("search freshness policy", () => {
	it("does not check merely because the tab briefly lost focus", () => {
		expect(wasAwayLongEnough(1_000, 1_000 + SEARCH_REFRESH_AWAY_MS - 1)).toBe(false);
		expect(wasAwayLongEnough(1_000, 1_000 + SEARCH_REFRESH_AWAY_MS)).toBe(true);
	});

	it("throttles returning-tab refreshes to once per minute", () => {
		expect(canRefreshSearchIndex(0, 1_000)).toBe(true);
		expect(canRefreshSearchIndex(1_000, 1_000 + SEARCH_REFRESH_INTERVAL_MS - 1)).toBe(false);
		expect(canRefreshSearchIndex(1_000, 1_000 + SEARCH_REFRESH_INTERVAL_MS)).toBe(true);
	});
});
