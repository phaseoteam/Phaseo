import type { Metadata, ResolvingMetadata } from "next";

const CANONICAL_SITE_URL = "https://phaseo.app";
const LOCAL_SITE_URL = "http://localhost:3000";
const LEGACY_SITE_URLS = new Set([
	"http://ai-stats.phaseo.app",
	"https://ai-stats.phaseo.app",
]);

const configuredSiteUrl =
	process.env.NEXT_PUBLIC_WEBSITE_URL ?? process.env.WEBSITE_URL;

if (process.env.NODE_ENV === "production" && !configuredSiteUrl) {
	console.warn(
		"[seo] NEXT_PUBLIC_WEBSITE_URL (or WEBSITE_URL) is not set; falling back to http://localhost:3000 during this build.",
	);
}

export function resolveSiteUrl(siteUrl: string | undefined): string {
	const normalizedSiteUrl = siteUrl?.trim().replace(/\/+$/, "");

	if (!normalizedSiteUrl) {
		return LOCAL_SITE_URL;
	}

	return LEGACY_SITE_URLS.has(normalizedSiteUrl)
		? CANONICAL_SITE_URL
		: normalizedSiteUrl;
}

const DEFAULT_SITE_URL = resolveSiteUrl(configuredSiteUrl);

export const SITE_NAME = "Phaseo";
export const PREFERRED_SITE_NAME = "Phaseo";
export const SITE_ALTERNATE_NAME = SITE_NAME;
export const SITE_URL = DEFAULT_SITE_URL;
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
	type = "website",
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
		applicationName: PREFERRED_SITE_NAME,
		metadataBase: METADATA_BASE,
		keywords,
		alternates: {
			canonical,
		},
		openGraph: {
			siteName: PREFERRED_SITE_NAME,
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
