import { builtInLogoData } from "@phaseo/app-kit/logos";
import { GET } from "./route";

describe("/logos/manifest.json", () => {
	it("publishes the built-in logo data with public CDN caching", async () => {
		const response = GET();
		expect(response.headers.get("cache-control")).toContain("s-maxage=");
		const body = await response.json();
		expect(body).toEqual(JSON.parse(JSON.stringify(builtInLogoData)));
		expect(body.logos.baselabs).toEqual({ color: "/logos/baselabs.svg" });
		expect(body.aliases.xai).toBe("spacex-ai");
		expect(body.labels.baselabs).toBe("Base Labs");
	});
});
