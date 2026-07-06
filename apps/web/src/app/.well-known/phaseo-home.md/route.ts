import {
	CONTENT_SIGNAL_VALUE,
	estimateMarkdownTokens,
	buildHomeMarkdown,
	HOME_LINK_HEADER,
} from "@/lib/agent-discovery";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";

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
			"Cache-Control": PUBLIC_CDN_CACHE_CONTROL,
			"Content-Signal": CONTENT_SIGNAL_VALUE,
			"Link": HOME_LINK_HEADER,
			"Vary": "Accept",
			"x-markdown-tokens": estimateMarkdownTokens(markdown),
		},
	});
}
