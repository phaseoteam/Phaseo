// Serves every page as Markdown to agents. A page is available as Markdown in
// two ways:
// - Content negotiation: `Accept: text/markdown` (preferred over, or tied with,
//   text/html) on the page's own URL.
// - A `.md` URL: `/models/openai/gpt-5.5.md` is `/models/openai/gpt-5.5`.
//
// The page renders as HTML as usual (the request is passed on with
// `Accept: text/html`, which TanStack Start requires: other Accept values get
// a 406), then its <main> content is converted. Redirects and other non-HTML
// responses pass through untouched. HTML responses for pages advertise the
// Markdown version in a `Link` header.
import { CONTENT_SIGNAL_VALUE, estimateMarkdownTokens } from "@/lib/agent-discovery";
import { COMPLETE_HEAD_HEADER } from "@/lib/start/completeHead";
import { htmlToMarkdown } from "./htmlToMarkdown";

const MARKDOWN_SUFFIX = ".md";

// Paths that are not pages, or that answer Markdown themselves.
const EXCLUDED_PREFIXES = [
	"/api/", "/_serverFn", "/_server", "/assets/", "/_content/", "/_messages/", "/_canary/", "/__markdown", "/.well-known/", "/og/",
	"/ingest/", "/docs", "/auth/", "/oauth/", "/logos/",
];
const STATIC_FILE = /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wasm|webmanifest|webp|woff2?|xml|zip)$/i;

type AcceptEntry = { type: string; q: number };

function parseAccept(header: string | null): AcceptEntry[] {
	if (!header) return [];
	return header.split(",").map((part) => {
		const [type, ...params] = part.trim().toLowerCase().split(";");
		const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
		const value = q ? Number(q.slice(2)) : 1;
		return { type: type.trim(), q: Number.isFinite(value) ? value : 0 };
	});
}

/** True when the Accept header asks for Markdown at least as much as for HTML. */
export function prefersMarkdown(accept: string | null): boolean {
	const entries = parseAccept(accept);
	const markdown = Math.max(0, ...entries.filter((e) => e.type === "text/markdown").map((e) => e.q));
	if (markdown <= 0) return false;
	const html = Math.max(0, ...entries.filter((e) => e.type === "text/html" || e.type === "text/*" || e.type === "*/*").map((e) => e.q));
	return markdown >= html;
}

function isPagePath(pathname: string): boolean {
	if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix))) return false;
	return !STATIC_FILE.test(pathname) && pathname !== "/robots.txt" && pathname !== "/status";
}

export type MarkdownRequest = { pagePath: string; viaSuffix: boolean };

/** Decides whether a request should get the Markdown version of a page. */
export function markdownRequest(request: Request): MarkdownRequest | null {
	if (request.method !== "GET" && request.method !== "HEAD") return null;
	const { pathname } = new URL(request.url);
	if (pathname.endsWith(MARKDOWN_SUFFIX)) {
		const pagePath = pathname === "/index.md" ? "/" : pathname.slice(0, -MARKDOWN_SUFFIX.length);
		return pagePath && isPagePath(pagePath) ? { pagePath, viaSuffix: true } : null;
	}
	// The homepage has its own hand-written Markdown (requestMiddleware.ts).
	if (pathname === "/" || !isPagePath(pathname)) return null;
	return prefersMarkdown(request.headers.get("accept")) ? { pagePath: pathname, viaSuffix: false } : null;
}

export function markdownUrlFor(url: URL): string {
	return `${url.origin}${url.pathname === "/" ? "/index" : url.pathname.replace(/\/$/, "")}${MARKDOWN_SUFFIX}`;
}

function appendVary(headers: Headers, value: string) {
	const current = headers.get("vary");
	if (!current) headers.set("vary", value);
	else if (!current.toLowerCase().split(/\s*,\s*/).includes(value.toLowerCase())) headers.set("vary", `${current}, ${value}`);
}

type PageFetch = (request: Request) => Promise<Response> | Response;

/**
 * Handles a request, serving Markdown when it asks for it. `fetchPage` renders
 * the site (TanStack Start's handler).
 */
export async function withMarkdownForAgents(request: Request, fetchPage: PageFetch): Promise<Response> {
	const wanted = markdownRequest(request);
	if (!wanted) {
		const response = await fetchPage(request);
		return advertiseMarkdown(request, response);
	}

	const url = new URL(request.url);
	const pageUrl = new URL(url);
	pageUrl.pathname = wanted.pagePath;
	if (wanted.viaSuffix && wanted.pagePath === "/") {
		// `/index.md` is the hand-written homepage Markdown.
		const headers = new Headers(request.headers);
		headers.set("accept", "text/markdown");
		return fetchPage(new Request(pageUrl, { method: "GET", headers }));
	}
	const headers = new Headers(request.headers);
	headers.set("accept", "text/html");
	headers.set(COMPLETE_HEAD_HEADER, "1");
	const response = await fetchPage(new Request(pageUrl, { method: "GET", headers, redirect: "manual" }));

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("text/html")) {
		// Keep a `.md` request on `.md` URLs when the page redirects.
		const location = response.headers.get("location");
		if (wanted.viaSuffix && location && response.status >= 300 && response.status < 400) {
			const target = new URL(location, pageUrl);
			if (target.origin === url.origin) {
				const redirected = new Response(null, response);
				redirected.headers.set("location", markdownUrlFor(target) + target.search);
				return redirected;
			}
		}
		return response;
	}

	const html = await response.text();
	const { markdown } = htmlToMarkdown(html, pageUrl.toString());
	const out = new Headers(response.headers);
	for (const name of ["content-length", "content-encoding", "etag", "last-modified", "link"]) out.delete(name);
	out.set("content-type", "text/markdown; charset=utf-8");
	out.set("x-markdown-tokens", estimateMarkdownTokens(markdown));
	if (!out.has("content-signal")) out.set("content-signal", CONTENT_SIGNAL_VALUE);
	// The HTML page stays the canonical, indexable version.
	out.set("link", `<${pageUrl.toString()}>; rel="canonical"`);
	if (!wanted.viaSuffix) appendVary(out, "Accept");
	return new Response(request.method === "HEAD" ? null : markdown, { status: response.status, statusText: response.statusText, headers: out });
}

function advertiseMarkdown(request: Request, response: Response): Response {
	if (request.method !== "GET" && request.method !== "HEAD") return response;
	if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return response;
	const url = new URL(request.url);
	if (!isPagePath(url.pathname)) return response;
	const alternate = `<${markdownUrlFor(url)}>; rel="alternate"; type="text/markdown"`;
	const advertised = new Response(response.body, response);
	const existing = advertised.headers.get("link");
	advertised.headers.set("link", existing ? `${existing}, ${alternate}` : alternate);
	appendVary(advertised.headers, "Accept");
	return advertised;
}
