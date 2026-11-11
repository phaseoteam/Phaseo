import { buildSitemap, type SitemapEntry } from "@/lib/seo/sitemap";
import { waitUntil } from "@/lib/start/wait-until";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toSitemapXml(entries: SitemapEntry[]): string {
	const urls = entries.map((entry) => {
		const lines = [`<loc>${escapeXml(entry.url)}</loc>`];
		if (entry.lastModified) {
			const lastModified = entry.lastModified instanceof Date ? entry.lastModified.toISOString() : String(entry.lastModified);
			lines.push(`<lastmod>${escapeXml(lastModified)}</lastmod>`);
		}
		if (entry.changeFrequency) lines.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
		if (entry.priority !== undefined) lines.push(`<priority>${entry.priority}</priority>`);
		return `<url>\n${lines.join("\n")}\n</url>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// Building the sitemap reads the whole public catalogue (about 0.8 s of Worker
// time), and only crawlers ask for it, so each data centre keeps a complete
// copy for 30 minutes. New models reach it within that window. Keys carry the
// build, so a deploy starts clean.
declare const __PHASEO_BUILD_ID__: string;
export const SITEMAP_CACHE_SECONDS = 30 * 60;
const BUILT_AT_HEADER = "x-phaseo-built-at";

function sitemapCache(): Cache | null {
	return (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches?.default ?? null;
}

function sitemapResponse(xml: string, builtAt: number): Response {
	return new Response(xml, {
		headers: {
			"content-type": "application/xml",
			"cache-control": `public, max-age=${SITEMAP_CACHE_SECONDS}`,
			[BUILT_AT_HEADER]: String(builtAt),
		},
	});
}

export async function serveSitemap(requestUrl: string): Promise<Response> {
	const cache = sitemapCache();
	const buildId = typeof __PHASEO_BUILD_ID__ === "string" ? __PHASEO_BUILD_ID__ : "dev";
	const key = new Request(`${new URL(requestUrl).origin}/sitemap.xml?__build=${encodeURIComponent(buildId)}`);
	const hit = cache ? await cache.match(key).catch(() => undefined) : undefined;
	if (hit) {
		const age = Date.now() - Number(hit.headers.get(BUILT_AT_HEADER) ?? 0);
		// Copied because cached responses have immutable headers and the request
		// middleware adds site-wide headers in place.
		if (age >= 0 && age < SITEMAP_CACHE_SECONDS * 1000) return new Response(hit.body, hit);
	}
	const { entries, complete } = await buildSitemap();
	const xml = toSitemapXml(entries);
	const builtAt = Date.now();
	if (cache && complete) void waitUntil(cache.put(key, sitemapResponse(xml, builtAt)));
	return sitemapResponse(xml, builtAt);
}
