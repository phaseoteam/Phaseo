import type { Metadata, ResolvingMetadata } from "next";

const configuredSiteUrl =
	process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.WEBSITE_URL;

if (process.env.NODE_ENV === "production" && !configuredSiteUrl) {
	throw new Error(
		"[seo] NEXT_PUBLIC_WEBSITE_URL (or WEBSITE_URL) must be set in production."
	);
}

const DEFAULT_SITE_URL = configuredSiteUrl ?? "http://localhost:3000";

export const SITE_URL = DEFAULT_SITE_URL.replace(/\/+$/, "");
export const METADATA_BASE = new URL(SITE_URL);

export interface BuildMetadataOptions {
	title: string;
	description: string;
	path: string;
	keywords?: string[];
	imagePath?: string;
	imageAlt?: string;
	type?: "website" | "article" | "profile" | "video.other";
	openGraph?: Metadata["openGraph"];
	twitter?: Metadata["twitter"];
	robots?: Metadata["robots"];
}

export function absoluteUrl(path: string): string {
	const normalised = path.startsWith("/")
		? path
		: `/${path}`;
	return new URL(normalised, SITE_URL).toString();
}

export function buildMetadata({
	title,
	description,
	path,
	keywords = [],
	imagePath,
	imageAlt,
	type = "article",
	openGraph: openGraphOverrides,
	twitter: twitterOverrides,
	robots,
}: BuildMetadataOptions): Metadata {
	const canonical = absoluteUrl(path);
	const imageUrl = imagePath
		? absoluteUrl(imagePath)
		: absoluteUrl("/og.png");
	const ogAlt = imageAlt ?? title;

	return {
		title,
		description,
		metadataBase: METADATA_BASE,
		keywords,
		alternates: {
			canonical,
		},
		openGraph: {
			siteName: "AI Stats",
			title,
			description,
			type,
			url: canonical,
			images: [
				{
					url: imageUrl,
					width: 1200,
					height: 630,
					alt: ogAlt,
				},
			],
			...openGraphOverrides,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [imageUrl],
			...twitterOverrides,
		},
		robots: robots ?? { index: true, follow: true },
	};
}

export async function resolveMetadata(
	resolver:
		| BuildMetadataOptions
		| ((parent: Awaited<ResolvingMetadata> | null) => Promise<BuildMetadataOptions>),
	parent?: ResolvingMetadata
): Promise<Metadata> {
	if (typeof resolver === "function") {
		const parentMetadata = parent ? await parent : null;
		const options = await resolver(parentMetadata);
		return buildMetadata(options);
	}

	return buildMetadata(resolver);
}
