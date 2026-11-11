import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const background: Promise<unknown>[] = [];
vi.mock("@/lib/start/wait-until", () => ({
	waitUntil: async (promise: Promise<unknown>) => {
		background.push(promise);
	},
}));
const buildSitemap = vi.fn();
vi.mock("@/lib/seo/sitemap", () => ({ buildSitemap: () => buildSitemap() }));

import { SITEMAP_CACHE_SECONDS, serveSitemap } from "./sitemapResponse";

// An in-memory stand-in for the Workers Cache API's caches.default.
function memoryCache() {
	const entries = new Map<string, Response>();
	return {
		match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
		put: vi.fn(async (key: Request, response: Response) => {
			entries.set(key.url, response.clone());
		}),
	};
}

const settle = async () => {
	await Promise.all(background.splice(0));
};
const sitemap = (urls: string[], complete = true) => ({ complete, entries: urls.map((url) => ({ url })) });
const SITEMAP_URL = "https://phaseo.app/sitemap.xml";

describe("sitemap response", () => {
	beforeEach(() => {
		buildSitemap.mockReset();
		vi.stubGlobal("caches", { default: memoryCache() });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("serves a repeat request from the cache without rebuilding", async () => {
		buildSitemap.mockResolvedValue(sitemap(["https://phaseo.app/models/openai/gpt-5"]));
		const first = await serveSitemap(SITEMAP_URL);
		await settle();
		const second = await serveSitemap(SITEMAP_URL);
		expect(buildSitemap).toHaveBeenCalledTimes(1);
		expect(await second.text()).toBe(await first.text());
		expect(second.headers.get("content-type")).toBe("application/xml");
		expect(second.headers.get("cache-control")).toBe(`public, max-age=${SITEMAP_CACHE_SECONDS}`);
		second.headers.set("x-test", "headers stay writable for the request middleware");
	});

	it("rebuilds after 30 minutes so new pages appear", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		buildSitemap.mockResolvedValueOnce(sitemap(["https://phaseo.app/a"])).mockResolvedValueOnce(sitemap(["https://phaseo.app/a", "https://phaseo.app/b"]));
		await serveSitemap(SITEMAP_URL);
		await settle();
		vi.setSystemTime(Date.now() + SITEMAP_CACHE_SECONDS * 1000);
		expect(await (await serveSitemap(SITEMAP_URL)).text()).toContain("https://phaseo.app/b");
		expect(buildSitemap).toHaveBeenCalledTimes(2);
	});

	it("never caches a sitemap that is missing a failed source", async () => {
		buildSitemap.mockResolvedValueOnce(sitemap(["https://phaseo.app/"], false)).mockResolvedValueOnce(sitemap(["https://phaseo.app/", "https://phaseo.app/models/openai/gpt-5"]));
		await serveSitemap(SITEMAP_URL);
		await settle();
		expect(await (await serveSitemap(SITEMAP_URL)).text()).toContain("/models/openai/gpt-5");
		expect(buildSitemap).toHaveBeenCalledTimes(2);
	});

	it("still serves the sitemap where the Cache API is missing", async () => {
		vi.unstubAllGlobals();
		vi.stubGlobal("caches", undefined);
		buildSitemap.mockResolvedValue(sitemap(["https://phaseo.app/x&y"]));
		expect(await (await serveSitemap(SITEMAP_URL)).text()).toContain("<loc>https://phaseo.app/x&amp;y</loc>");
	});
});
