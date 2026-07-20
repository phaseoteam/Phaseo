import { describe, expect, it } from "vitest";
import { PRIVATE_NO_STORE_HEADERS, publicCacheHeaders } from "./cache";

describe("cache policy helpers", () => {
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
