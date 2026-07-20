import { GLOBAL_NAVIGATION_ITEMS } from "./Search.navigation";

describe("global search navigation", () => {
	it("contains unique, local destinations", () => {
		const ids = GLOBAL_NAVIGATION_ITEMS.map((item) => item.id);
		const hrefs = GLOBAL_NAVIGATION_ITEMS.map((item) => item.href);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(hrefs).size).toBe(hrefs.length);
		expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
	});

	it("exposes the primary catalogue and account destinations", () => {
		expect(GLOBAL_NAVIGATION_ITEMS).toEqual(expect.arrayContaining([
			expect.objectContaining({ title: "Models", href: "/models" }),
			expect.objectContaining({ title: "API Providers", href: "/api-providers" }),
			expect.objectContaining({ title: "Settings", href: "/settings" }),
			expect.objectContaining({ title: "API Keys", href: "/settings/keys" }),
		]));
	});
});
