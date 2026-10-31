// The homepage as Markdown, for agents that ask for text/markdown.
import {
	CONTENT_SIGNAL_VALUE,
	estimateMarkdownTokens,
	buildHomeMarkdown,
	HOME_LINK_HEADER,
} from "@/lib/agent-discovery";

/** Cache policy for the content-negotiated homepage and `/__markdown`. */
export const HOME_MARKDOWN_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=300";

/** Serves the homepage Markdown for `?path=/` (the default); any other path is a 404. */
export function homeMarkdownResponse(request: Request, cacheControl: string): Response {
	const url = new URL(request.url);
	const path = url.searchParams.get("path") ?? "/";

	if (path !== "/") {
		return new Response("Not Found", { status: 404 });
	}

	const markdown = buildHomeMarkdown();

	return new Response(markdown, {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": cacheControl,
			"Content-Signal": CONTENT_SIGNAL_VALUE,
			"Link": HOME_LINK_HEADER,
			"Vary": "Accept",
			"x-markdown-tokens": estimateMarkdownTokens(markdown),
		},
	});
}
