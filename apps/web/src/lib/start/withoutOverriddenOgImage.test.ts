import { describe, expect, it } from "vitest";
import { metadataToHead, withoutOverriddenOgImage } from "./metadataToHead";

const layoutHead = metadataToHead({
	title: "Phaseo",
	openGraph: { title: "Phaseo", images: [{ url: "https://phaseo.app/og.png", width: 1200, height: 630, alt: "Phaseo" }] },
});

const ogImageTags = (head: ReturnType<typeof metadataToHead>) => head.meta.filter((entry) => entry.property?.startsWith("og:image")).map((entry) => entry.property);

describe("withoutOverriddenOgImage", () => {
	it("keeps the layout image when no deeper route sets one", () => {
		const matches = [{ id: "/{-$locale}", loaderData: {} }, { id: "/{-$locale}/about/", loaderData: { metadata: { title: "About" } } }];
		expect(ogImageTags(withoutOverriddenOgImage(layoutHead, matches, "/{-$locale}"))).toEqual(["og:image", "og:image:width", "og:image:height", "og:image:alt"]);
	});

	it("drops every layout og:image tag when a deeper route sets its own image", () => {
		const matches = [
			{ id: "/{-$locale}", loaderData: {} },
			{ id: "/{-$locale}/_dashboard/blog/$slug/", loaderData: { metadata: { openGraph: { images: [{ url: "https://phaseo.app/blog-images/cover.png" }] } } } },
		];
		const head = withoutOverriddenOgImage(layoutHead, matches, "/{-$locale}");
		expect(ogImageTags(head)).toEqual([]);
		expect(head.meta.some((entry) => entry.property === "og:title")).toBe(true);
	});

	it("ignores routes above the layout", () => {
		const matches = [
			{ id: "__root__", loaderData: { metadata: { openGraph: { images: ["https://phaseo.app/x.png"] } } } },
			{ id: "/{-$locale}", loaderData: {} },
		];
		expect(ogImageTags(withoutOverriddenOgImage(layoutHead, matches, "/{-$locale}"))).toHaveLength(4);
	});
});
