import { createFileRoute } from "@tanstack/react-router";
import { HOME_MARKDOWN_CACHE_CONTROL, homeMarkdownResponse } from "@/lib/http/homeMarkdown";

export const Route = createFileRoute("/__markdown/")({
	server: {
		handlers: {
			GET: ({ request }) => homeMarkdownResponse(request, HOME_MARKDOWN_CACHE_CONTROL),
		},
	},
});
