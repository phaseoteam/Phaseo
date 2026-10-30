import { isPublicDataPathname } from "./publicDataRoutes";

describe("isPublicDataPathname", () => {
	it.each([
		"/models",
		"/models/openai/gpt-5",
		"/api-providers",
		"/collections/frontier-models",
		"/compare",
		"/performance",
		"/pricing",
	])("recognises %s as a public data route", (pathname) => {
		expect(isPublicDataPathname(pathname)).toBe(true);
	});

	it.each([
		"/",
		"/contact",
		"/settings",
		"/modelish",
		"/rankings",
		"/updates",
		"/monitor",
		"/gateway/marketplace/my-preset",
		null,
		undefined,
	])(
		"does not recognise %s as a public data route",
		(pathname) => {
			expect(isPublicDataPathname(pathname)).toBe(false);
		},
	);
});
