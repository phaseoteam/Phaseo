import { resolveSiteUrl } from "./seo";

describe("resolveSiteUrl", () => {
	it("normalizes the legacy ai-stats subdomain to the canonical Phaseo host", () => {
		expect(resolveSiteUrl("https://ai-stats.phaseo.app/")).toBe(
			"https://phaseo.app",
		);
	});

	it("preserves explicitly configured non-legacy hosts", () => {
		expect(resolveSiteUrl("https://preview.phaseo.app/")).toBe(
			"https://preview.phaseo.app",
		);
	});

	it("falls back to the canonical host in production", () => {
		expect(resolveSiteUrl(undefined, "production")).toBe("https://phaseo.app");
	});

	it("falls back to localhost outside production", () => {
		expect(resolveSiteUrl(undefined, "test")).toBe("http://localhost:3000");
	});
});
