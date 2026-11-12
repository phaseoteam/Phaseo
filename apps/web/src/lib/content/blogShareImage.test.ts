import { describe, expect, it } from "vitest";
import { parseDynamicOgParams } from "@/lib/og/dynamicOg";
import { blogShareImage } from "./blogShareImage";

const post = {
	slug: "icymi-october-2026-what-we-shipped",
	title: "ICYMI: What We Shipped in October 2026",
	description: "October brought rate limits, Broadcast destinations and prompt templates.",
	coverImage: "/blog-images/recap-october-2026.png",
};

function dynamicParams(path: string) {
	return new URLSearchParams(path.slice("/og/dynamic?".length));
}

describe("blogShareImage", () => {
	it("uses a raster cover as is, without claiming a size", () => {
		expect(blogShareImage(post)).toEqual({ path: "/blog-images/recap-october-2026.png" });
	});

	it("uses a dynamic card for posts without a raster cover", () => {
		expect(blogShareImage({ ...post, coverImage: "/blog-images/cover.svg" })?.path.startsWith("/og/dynamic?")).toBe(true);
		const image = blogShareImage({ ...post, coverImage: null });
		expect(image?.size).toEqual({ width: 1200, height: 630 });
		expect(image?.path.startsWith("/og/dynamic?")).toBe(true);
		const parsed = parseDynamicOgParams(dynamicParams(image!.path));
		expect(parsed).toEqual({
			ok: true,
			value: {
				title: post.title,
				description: post.description,
				pathname: "/blog/icymi-october-2026-what-we-shipped",
			},
		});
	});

	it("shortens long text to fit the card", () => {
		const image = blogShareImage({
			...post,
			coverImage: null,
			title: "A very long title ".repeat(8).trim(),
			description: "A long description that keeps going ".repeat(10).trim(),
		});
		const parsed = parseDynamicOgParams(dynamicParams(image!.path));
		expect(parsed.ok).toBe(true);
	});

	it("keeps shortened titles within the limit after normalisation", () => {
		const image = blogShareImage({
			...post,
			coverImage: null,
			title: `${"a".repeat(88)} bbbbbb`,
		});
		const params = dynamicParams(image!.path);
		expect(parseDynamicOgParams(params).ok).toBe(true);
		expect(params.get("title")?.endsWith("...")).toBe(true);
	});

	it("drops a description the card refuses", () => {
		const image = blogShareImage({
			...post,
			coverImage: null,
			description: "Details at https://example.com",
		});
		expect(dynamicParams(image!.path).has("description")).toBe(false);
	});

	it("falls back to the default image for text the card can't draw", () => {
		expect(
			blogShareImage({
				...post,
				coverImage: null,
				title: "10月の新機能",
			}),
		).toBeNull();
	});
});
