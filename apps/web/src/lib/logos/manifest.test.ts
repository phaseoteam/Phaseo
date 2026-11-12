import { describe, it, expect } from "vitest";
import { builtInLogoData } from "@phaseo/app-kit/logos";
import { logoManifestResponse } from "./manifest";

describe("/logos/manifest.json", () => {
	it("publishes the built-in logo data with public CDN caching", async () => {
		const response = logoManifestResponse();
		expect(response.headers.get("cache-control")).toContain("s-maxage=");
		const body = await response.json();
		expect(body).toEqual(JSON.parse(JSON.stringify(builtInLogoData)));
		expect(body.logos.baselabs).toEqual({ color: "/logos/baselabs.svg" });
		expect(body.aliases.xai).toBe("spacex-ai");
		expect(body.labels.baselabs).toBe("Base Labs");
	});
});
