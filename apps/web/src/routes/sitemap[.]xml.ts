// The sitemap, built from the public catalogue and serialised to XML.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { serveSitemap } = await import("@/lib/seo/sitemapResponse");
				return serveSitemap(request.url);
			},
		},
	},
});
