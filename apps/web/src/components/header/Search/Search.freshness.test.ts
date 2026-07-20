import {
	canCheckSearchGeneration,
	SEARCH_GENERATION_CHECK_INTERVAL_MS,
	SEARCH_REFRESH_AWAY_MS,
	searchIndexPath,
	wasAwayLongEnough,
} from "./Search.freshness";

describe("search freshness policy", () => {
	it("does not check merely because the tab briefly lost focus", () => {
		expect(wasAwayLongEnough(1_000, 1_000 + SEARCH_REFRESH_AWAY_MS - 1)).toBe(false);
		expect(wasAwayLongEnough(1_000, 1_000 + SEARCH_REFRESH_AWAY_MS)).toBe(true);
	});

	it("throttles eligible checks to once per fifteen minutes", () => {
		expect(canCheckSearchGeneration(0, 1_000)).toBe(true);
		expect(canCheckSearchGeneration(1_000, 1_000 + SEARCH_GENERATION_CHECK_INTERVAL_MS - 1)).toBe(false);
		expect(canCheckSearchGeneration(1_000, 1_000 + SEARCH_GENERATION_CHECK_INTERVAL_MS)).toBe(true);
	});

	it("uses a new browser cache key only for a known newer generation", () => {
		expect(searchIndexPath()).toBe("/api/_web/search");
		expect(searchIndexPath(42)).toBe("/api/_web/search?generation=42");
	});
});
