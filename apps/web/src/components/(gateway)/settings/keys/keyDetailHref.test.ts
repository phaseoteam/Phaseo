import { matchesKeyRouteName } from "./keyDetailHref";

describe("key route name comparison", () => {
	const name = "OAuth: https://chatgpt.com/oauth/client.json";
	it.each([name, encodeURIComponent(name), "OAuth: https:%2F%2Fchatgpt.com%2Foauth%2Fclient.json"])("recognizes the same key without a canonical redirect: %s", (routeName) => {
		expect(matchesKeyRouteName(name, routeName)).toBe(true);
	});
	it("keeps renamed bookmarks eligible for a canonical redirect", () => {
		expect(matchesKeyRouteName("New name", "Old name")).toBe(false);
	});
	it("accepts literal percent characters without decoding valid names again", () => {
		expect(matchesKeyRouteName("100%", "100%")).toBe(true);
		expect(matchesKeyRouteName("literal%2F", "literal%2F")).toBe(true);
		expect(matchesKeyRouteName("other", "100%")).toBe(false);
	});
});
