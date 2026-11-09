import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";
import { homeMarkdownResponse } from "@/lib/http/homeMarkdown";

export const Route = createFileRoute("/.well-known/phaseo-home.md/")({
	server: {
		handlers: {
			GET: ({ request }) => homeMarkdownResponse(request, PUBLIC_CDN_CACHE_CONTROL),
		},
	},
});
