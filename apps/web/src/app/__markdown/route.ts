import {
	CONTENT_SIGNAL_VALUE,
	estimateMarkdownTokens,
	buildHomeMarkdown,
	HOME_LINK_HEADER,
} from "@/lib/agent-discovery";

export async function GET(request: Request) {
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
			"Cache-Control": "public, max-age=300, stale-while-revalidate=300",
			"Content-Signal": CONTENT_SIGNAL_VALUE,
			"Link": HOME_LINK_HEADER,
			"Vary": "Accept",
			"x-markdown-tokens": estimateMarkdownTokens(markdown),
		},
	});
}
