import { resolveTitle } from "next/dist/lib/metadata/resolvers/resolve-title";
import { buildMetadata, resolveSiteUrl } from "./seo";

describe("page title branding", () => {
	it.each([
		["About", "About | Phaseo"],
		["GPT 5.6 Luna API Pricing — Compare 22 Providers | Phaseo", "GPT 5.6 Luna API Pricing — Compare 22 Providers | Phaseo"],
		["Benchmarks | Phaseo", "Benchmarks | Phaseo"],
		["Music Room - Phaseo Chat", "Music Room - Phaseo Chat"],
		["Phaseo vs Example", "Phaseo vs Example"],
		["Phaseo: AI Gateway and Open Model Catalog", "Phaseo: AI Gateway and Open Model Catalog"],
	])("resolves %s with exactly one brand", (title, expected) => {
		const metadata = buildMetadata({ title, description: "Description", path: "/example" });
		expect(resolveTitle(metadata.title, "%s | Phaseo").absolute).toBe(expected);
		expect(metadata.openGraph?.title).toBe(title);
		expect(metadata.twitter?.title).toBe(title);
	});
});

describe("resolveSiteUrl", () => {
	const legacyAiStatsUrl = `https://${["ai-stats", "phaseo", "app"].join(".")}`;

	it("keeps the canonical Phaseo host", () => {
		expect(resolveSiteUrl("https://phaseo.app/")).toBe(
			"https://phaseo.app",
		);
	});

	it("upgrades the canonical Phaseo host to HTTPS", () => {
		expect(resolveSiteUrl("http://phaseo.app/")).toBe(
			"https://phaseo.app",
		);
	});

	it.each([
		legacyAiStatsUrl,
		`${legacyAiStatsUrl}/`,
		"https://www.phaseo.app/",
	])("consolidates legacy production host %s", (siteUrl) => {
		expect(resolveSiteUrl(siteUrl)).toBe("https://phaseo.app");
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
