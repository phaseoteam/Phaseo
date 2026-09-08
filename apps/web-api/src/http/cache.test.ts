import { describe, expect, it } from "vitest";
import { PRIVATE_NO_STORE_HEADERS, publicCacheHeaders } from "./cache";

describe("cache policy helpers", () => {
	it("keeps a week of edge staleness out of the browser cache", () => {
		const headers = publicCacheHeaders({
			edgeTtlSeconds: 300,
			staleWhileRevalidateSeconds: 604800,
			staleIfErrorSeconds: 604800,
			browserTtlSeconds: 0,
			browserStaleWhileRevalidateSeconds: 0,
		});
		expect(headers["Cache-Control"]).toBe("public, max-age=0, s-maxage=300");
		expect(headers["Cloudflare-CDN-Cache-Control"]).toBe("public, max-age=300, stale-while-revalidate=604800, stale-if-error=604800");
	});

	it("makes anonymous data cacheable for browsers and Workers Cache", () => {
		expect(publicCacheHeaders({ edgeTtlSeconds: 30, staleWhileRevalidateSeconds: 60 })).toEqual({
			"Cache-Control": "public, max-age=60, s-maxage=30, stale-while-revalidate=60",
			"Cloudflare-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=60",
		});
	});

	it("allows immutable-ish public data to stay in the browser cache longer", () => {
		expect(publicCacheHeaders({
			edgeTtlSeconds: 86_400,
			browserTtlSeconds: 86_400,
			staleWhileRevalidateSeconds: 604_800,
			cacheTags: ["web-api-search"],
		})).toEqual({
			"Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
			"Cloudflare-CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
			"Cache-Tag": "web-api-search",
		});
	});

  it("never permits shared caching for account data", () => {
    expect(PRIVATE_NO_STORE_HEADERS).toEqual({
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    });
  });
});
