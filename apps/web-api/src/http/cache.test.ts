import { describe, expect, it } from "vitest";
import { PRIVATE_NO_STORE_HEADERS, publicCacheHeaders } from "./cache";

describe("cache policy helpers", () => {
	it("makes anonymous data cacheable for browsers and Workers Cache", () => {
		expect(publicCacheHeaders({ edgeTtlSeconds: 30, staleWhileRevalidateSeconds: 60 })).toEqual({
			"Cache-Control": "public, max-age=60, s-maxage=30, stale-while-revalidate=60",
			"Cloudflare-CDN-Cache-Control": "public, max-age=30, stale-while-revalidate=60",
		});
	});

  it("never permits shared caching for account data", () => {
    expect(PRIVATE_NO_STORE_HEADERS).toEqual({
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    });
  });
});
