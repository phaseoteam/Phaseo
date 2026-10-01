import { describe, expect, it } from "vitest";
import { PUBLIC_LIVE_DATA_CACHE } from "./publicLiveData";
import { PUBLIC_MODEL_CATALOGUE_CACHE } from "./catalogue";
import { publicCacheHeaders, PRIVATE_NO_STORE_HEADERS } from "@/http/cache";

describe("fifteen-minute public data policy", () => {
	it.each([PUBLIC_LIVE_DATA_CACHE, PUBLIC_MODEL_CATALOGUE_CACHE])("expires without an extra stale-serving or browser-cache window", (policy) => {
		const headers = publicCacheHeaders(policy);
		expect(headers["Cloudflare-CDN-Cache-Control"]).toBe("public, max-age=900");
		expect(headers["Cache-Control"]).toBe("public, max-age=0");
	});

	it("retains catalogue purge tags and private no-store isolation", () => {
		expect(publicCacheHeaders(PUBLIC_MODEL_CATALOGUE_CACHE)["Cache-Tag"]).toBe("web-api-models,web-api-gateway-models");
		expect(PRIVATE_NO_STORE_HEADERS["Cache-Control"]).toBe("private, no-store");
	});
});
