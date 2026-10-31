// Page metadata without holding the shell. Next streams metadata to browsers
// and blocks only for bots; this does the same. Crawlers and link-preview bots
// get the title, description and Open Graph tags in the first bytes. Browsers
// get the shell straight away, and the title follows once metadata resolves.
import { createIsomorphicFn } from "@tanstack/react-start";
import { defer, useMatches } from "@tanstack/react-router";
import { Suspense, use, useEffect } from "react";
import { getCurrentRequest } from "@/compat/request-context";
import { metadataToHead } from "./metadataToHead";
import type { SerializableMetadata } from "./nextPage";

// Next's HTML-limited bot list (Googlebot etc. render JS, but still index the
// first HTML), plus generic crawler words for bots that identify themselves.
const BOT_USER_AGENT = /Googlebot|Google-|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|TelegramBot|Embedly|Pinterest|bot\b|crawler|spider/i;

const isCrawlerRequest = createIsomorphicFn()
	.server(() => BOT_USER_AGENT.test(getCurrentRequest()?.headers.get("user-agent") ?? ""))
	.client(() => false);

type Metadata = SerializableMetadata | null;

export type MetadataLoaderData = { metadata?: Metadata; deferredMetadata?: Promise<Metadata> };

/** Loader result: awaited metadata for crawlers, a streamed promise for everyone else. */
export async function metadataLoaderData(promise: Promise<Metadata>): Promise<MetadataLoaderData> {
	if (isCrawlerRequest()) return { metadata: await promise };
	// A metadata failure must not fail the page; the title just stays generic.
	return { deferredMetadata: defer(promise.catch(() => null)) };
}

function ApplyMetadata({ promise }: { promise: Promise<Metadata> }) {
	const metadata = use(promise);
	useEffect(() => {
		const meta = metadataToHead(metadata).meta;
		const title = meta.find((entry) => entry.title)?.title;
		if (title) document.title = title;
		const description = meta.find((entry) => entry.name === "description")?.content;
		if (description) {
			let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
			if (!tag) {
				tag = document.createElement("meta");
				tag.name = "description";
				document.head.appendChild(tag);
			}
			tag.content = description;
		}
	}, [metadata]);
	return null;
}

/**
 * Applies the deepest route's streamed metadata once it resolves. Rendered
 * once at the root: a page and its layout can both stream metadata, and the
 * page's (the deepest) wins, as with Next's metadata merging.
 */
export function StreamedMetadata() {
	const promise = useMatches({
		select: (matches) => {
			for (let i = matches.length - 1; i >= 0; i--) {
				const data = matches[i].loaderData as MetadataLoaderData | undefined;
				if (data?.metadata) return undefined;
				if (data?.deferredMetadata) return data.deferredMetadata;
			}
			return undefined;
		},
	});
	if (!promise) return null;
	return (
		<Suspense fallback={null}>
			<ApplyMetadata promise={promise} />
		</Suspense>
	);
}
