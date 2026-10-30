// Next: src/app/sitemap.ts (a metadata route Next serialises to XML).
import { createFileRoute } from "@tanstack/react-router";
import type { MetadataRoute } from "next";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function toSitemapXml(entries: MetadataRoute.Sitemap): string {
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

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
				const { default: sitemap } = await import("@/app/sitemap");
				return new Response(toSitemapXml(await sitemap()), {
					headers: {
						"content-type": "application/xml",
						"cache-control": "public, max-age=0, must-revalidate",
					},
				});
			},
		},
	},
});
