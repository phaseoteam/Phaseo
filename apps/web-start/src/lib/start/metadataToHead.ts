// Next.js `Metadata` objects → TanStack Router `head()` output. Pages keep
// their existing generateMetadata logic and pass the result through here.
import { METADATA_BASE, SITE_NAME } from "@/lib/seo";

type Meta = { [key: string]: unknown };
type HeadMeta = { title?: string; name?: string; property?: string; content?: string; charSet?: string };
type HeadLink = { rel: string; href: string; hrefLang?: string; type?: string; sizes?: string; media?: string };
export type HeadOutput = { meta: HeadMeta[]; links: HeadLink[] };

const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

function abs(url: unknown, base: URL): string | undefined {
	if (url === undefined || url === null) return undefined;
	const value = url instanceof URL ? url.toString() : String(url);
	try {
		return new URL(value, base).toString();
	} catch {
		return value;
	}
}

function resolveTitle(title: unknown, template: string | undefined): string | undefined {
	if (title === undefined || title === null) return undefined;
	if (typeof title === "string") return template ? template.replace("%s", title) : title;
	const t = title as { absolute?: string; default?: string; template?: string };
	if (t.absolute) return t.absolute;
	if (t.default) return t.default;
	return undefined;
}

function robotsContent(robots: unknown): string | undefined {
	if (!robots) return undefined;
	if (typeof robots === "string") return robots;
	const r = robots as { index?: boolean; follow?: boolean; nocache?: boolean; noarchive?: boolean; nosnippet?: boolean; noimageindex?: boolean };
	const parts: string[] = [];
	if (r.index !== undefined) parts.push(r.index ? "index" : "noindex");
	if (r.follow !== undefined) parts.push(r.follow ? "follow" : "nofollow");
	if (r.nocache) parts.push("nocache");
	if (r.noarchive) parts.push("noarchive");
	if (r.nosnippet) parts.push("nosnippet");
	if (r.noimageindex) parts.push("noimageindex");
	return parts.length ? parts.join(", ") : undefined;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * @param metadata  the object a Next `generateMetadata` returned
 * @param options.root  set for the root layout's metadata (no title template applied)
 */
export function metadataToHead(metadata: Meta | undefined | null, options: { root?: boolean } = {}): HeadOutput {
	const meta: HeadMeta[] = [];
	const links: HeadLink[] = [];
	if (!metadata) return { meta, links };
	const base = metadata.metadataBase instanceof URL ? metadata.metadataBase : new URL(String(metadata.metadataBase ?? METADATA_BASE));

	const title = resolveTitle(metadata.title, options.root ? undefined : TITLE_TEMPLATE);
	if (title) meta.push({ title });
	if (typeof metadata.description === "string") meta.push({ name: "description", content: metadata.description });
	const keywords = asArray(metadata.keywords as string | string[]);
	if (keywords.length) meta.push({ name: "keywords", content: keywords.join(", ") });
	if (typeof metadata.applicationName === "string") meta.push({ name: "application-name", content: metadata.applicationName });
	for (const author of asArray(metadata.authors as { name?: string } | Array<{ name?: string }>)) if (author?.name) meta.push({ name: "author", content: author.name });
	if (typeof metadata.creator === "string") meta.push({ name: "creator", content: metadata.creator });
	if (typeof metadata.publisher === "string") meta.push({ name: "publisher", content: metadata.publisher });
	if (typeof metadata.category === "string") meta.push({ name: "category", content: metadata.category });
	const robots = robotsContent(metadata.robots);
	if (robots) meta.push({ name: "robots", content: robots });

	const alternates = metadata.alternates as { canonical?: unknown; languages?: Record<string, unknown>; types?: Record<string, unknown> } | undefined;
	if (alternates?.canonical) links.push({ rel: "canonical", href: abs(alternates.canonical, base)! });
	for (const [lang, href] of Object.entries(alternates?.languages ?? {})) if (href) links.push({ rel: "alternate", hrefLang: lang, href: abs(href, base)! });
	for (const [type, href] of Object.entries(alternates?.types ?? {})) if (href) links.push({ rel: "alternate", type, href: abs(href, base)! });

	const og = metadata.openGraph as Meta | undefined;
	if (og) {
		const ogTitle = resolveTitle(og.title, undefined);
		if (ogTitle) meta.push({ property: "og:title", content: ogTitle });
		if (typeof og.description === "string") meta.push({ property: "og:description", content: og.description });
		if (og.url) meta.push({ property: "og:url", content: abs(og.url, base) });
		if (typeof og.siteName === "string") meta.push({ property: "og:site_name", content: og.siteName });
		if (typeof og.locale === "string") meta.push({ property: "og:locale", content: og.locale });
		for (const alt of asArray(og.alternateLocale as string | string[])) meta.push({ property: "og:locale:alternate", content: alt });
		meta.push({ property: "og:type", content: typeof og.type === "string" ? og.type : "website" });
		for (const image of asArray(og.images as unknown)) {
			const img = typeof image === "string" || image instanceof URL ? { url: image } : (image as { url?: unknown; width?: number; height?: number; alt?: string });
			if (!img?.url) continue;
			meta.push({ property: "og:image", content: abs(img.url, base) });
			if (img.width) meta.push({ property: "og:image:width", content: String(img.width) });
			if (img.height) meta.push({ property: "og:image:height", content: String(img.height) });
			if (img.alt) meta.push({ property: "og:image:alt", content: img.alt });
		}
		if (typeof og.publishedTime === "string") meta.push({ property: "article:published_time", content: og.publishedTime });
		if (typeof og.modifiedTime === "string") meta.push({ property: "article:modified_time", content: og.modifiedTime });
	}

	const tw = metadata.twitter as Meta | undefined;
	if (tw) {
		if (typeof tw.card === "string") meta.push({ name: "twitter:card", content: tw.card });
		const twTitle = resolveTitle(tw.title, undefined);
		if (twTitle) meta.push({ name: "twitter:title", content: twTitle });
		if (typeof tw.description === "string") meta.push({ name: "twitter:description", content: tw.description });
		if (typeof tw.site === "string") meta.push({ name: "twitter:site", content: tw.site });
		if (typeof tw.creator === "string") meta.push({ name: "twitter:creator", content: tw.creator });
		for (const image of asArray(tw.images as unknown)) {
			const url = typeof image === "string" || image instanceof URL ? image : (image as { url?: unknown })?.url;
			if (url) meta.push({ name: "twitter:image", content: abs(url, base) });
		}
	}

	const verification = metadata.verification as { google?: string; other?: Record<string, string | string[]> } | undefined;
	if (verification?.google) meta.push({ name: "google-site-verification", content: verification.google });
	for (const [name, value] of Object.entries(verification?.other ?? {})) for (const v of asArray(value)) meta.push({ name, content: v });
	for (const [name, value] of Object.entries((metadata.other as Record<string, unknown>) ?? {})) for (const v of asArray(value as string | string[])) meta.push({ name, content: String(v) });

	if (typeof metadata.manifest === "string") links.push({ rel: "manifest", href: metadata.manifest });
	return { meta, links };
}

/**
 * Metadata a child loader attached with `notFound({ data: { metadata } })`.
 * The router moves a not-found to the nearest route with a notFoundComponent
 * and stops running head() below it, so that boundary applies the metadata.
 */
export function notFoundMetadata(match: { error?: unknown }): Parameters<typeof metadataToHead>[0] | undefined {
	return (match.error as { data?: { metadata?: Parameters<typeof metadataToHead>[0] } } | undefined)?.data?.metadata;
}
