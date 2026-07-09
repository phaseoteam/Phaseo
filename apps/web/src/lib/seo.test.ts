import { resolveSiteUrl } from "./seo";

describe("resolveSiteUrl", () => {
	it("normalizes the legacy ai-stats subdomain to the canonical Phaseo host", () => {
		expect(resolveSiteUrl("https://ai-stats.phaseo.app/")).toBe(
			"https://phaseo.app",
		);
	});

	it("normalizes the http legacy ai-stats subdomain to the canonical Phaseo host", () => {
		expect(resolveSiteUrl("http://ai-stats.phaseo.app/")).toBe(
			"https://phaseo.app",
		);
	});

	it("preserves explicitly configured non-legacy hosts", () => {
		expect(resolveSiteUrl("https://preview.phaseo.app/")).toBe(
			"https://preview.phaseo.app",
		);
	});

	it("falls back to localhost when no site URL is configured", () => {
		expect(resolveSiteUrl(undefined)).toBe("http://localhost:3000");
	});
});
