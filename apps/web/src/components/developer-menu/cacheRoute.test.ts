import { getCacheControlHref, getPageCacheTarget } from "./cacheRoute";

describe("developer-menu cache routing", () => {
	it.each([
		["/", "landing", undefined],
		["/models", "catalogue", undefined],
		["/models/collections/frontier", "catalogue", undefined],
		["/models/openai/gpt-5", "model", "openai/gpt-5"],
		["/models/openai/gpt-5/pricing", "model", "openai/gpt-5"],
		["/api-providers/openai", "provider", "openai"],
		["/organisations/anthropic", "organisation", "anthropic"],
		["/benchmarks/mmlu-pro", "benchmark", "mmlu-pro"],
		["/apps", "apps", undefined],
		["/rankings/providers", "rankings", undefined],
		["/updates/models", "updates", undefined],
		["/pricing", "pricing", undefined],
	] as const)("maps %s to %s", (pathname, scope, targetId) => {
		const target = getPageCacheTarget(pathname);
		expect(target).toEqual(expect.objectContaining({ scope }));
		expect(target?.targetId).toBe(targetId);
	});

	it("does not guess a cache family for unrelated or invalid routes", () => {
		expect(getPageCacheTarget("/settings/keys")).toBeNull();
		expect(getPageCacheTarget("/models/%E0%A4%A/gpt")).toBeNull();
	});

	it("builds a prefilled Cache Control Centre link", () => {
		expect(getCacheControlHref(getPageCacheTarget("/models/openai/gpt-5"))).toBe(
			"/internal/cache?scope=model&target=openai%2Fgpt-5",
		);
	});
});
