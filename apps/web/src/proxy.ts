import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { isPublicLocale, routing } from "@/i18n/routing";
import { updateSession } from "@/utils/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);
const LOCALIZED_AUTH_ROUTE_ROOTS = new Set(["sign-in", "sign-up", "error"]);
const SESSION_MIDDLEWARE_PAGE_ROOTS = [
	"/blog",
	"/settings",
	"/apps",
	"/gateway",
	"/onboarding",
	"/internal",
	"/chat",
];
// Ignore common static assets without excluding dotted model identifiers such as gpt-4.1.
const STATIC_ASSET_PATH_SUFFIX =
	/\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wasm|webmanifest|webp|woff2?|xml|zip)$/i;

const RETIRED_BLOG_SLUGS = new Set([
	"security-notice-key-rotation-vercel-2026-04-19",
]);

function wantsMarkdown(request: NextRequest): boolean {
	const accept = request.headers.get("accept")?.toLowerCase() ?? "";
	return request.method === "GET" && accept.includes("text/markdown");
}

function withoutLocalePrefix(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (isPublicLocale(segments[0])) {
		segments.shift();
	}
	return `/${segments.join("/")}`;
}

function getBlogSlugDate(pathname: string): Date | null {
	const slug = withoutLocalePrefix(pathname).replace(/^\/blog\//, "").split("/")[0];
	const match = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		return null;
	}

	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRetiredBlogPath(pathname: string): boolean {
	const slug = withoutLocalePrefix(pathname).replace(/^\/blog\//, "").split("/")[0];
	return RETIRED_BLOG_SLUGS.has(slug);
}

function isRouteHandlerPath(pathname: string): boolean {
	return (
		pathname === "/robots.txt" ||
		pathname === "/indexnow-key.txt" ||
		pathname.startsWith("/api/") ||
		pathname.startsWith("/.well-known/") ||
		pathname.startsWith("/og/") ||
		pathname.startsWith("/__markdown") ||
		pathname === "/auth/callback" ||
		pathname === "/oauth/consent/submit" ||
		pathname === "/status" ||
		pathname === "/docs" ||
		pathname.startsWith("/docs/") ||
		pathname.startsWith("/ingest/") ||
		STATIC_ASSET_PATH_SUFFIX.test(pathname)
	);
}

function needsSessionMiddleware(pathname: string): boolean {
	const pagePath = withoutLocalePrefix(pathname);
	return SESSION_MIDDLEWARE_PAGE_ROOTS.some(
		(root) => pagePath === root || pagePath.startsWith(`${root}/`),
	);
}

export function isLocalizedAuthPath(pathname: string): boolean {
	const segments = pathname.split("/").filter(Boolean);
	if (isPublicLocale(segments[0])) {
		segments.shift();
	}

	return (
		segments.length === 1 && LOCALIZED_AUTH_ROUTE_ROOTS.has(segments[0])
	);
}

/**
 * Every React page is rooted at [locale]. next-intl owns negotiation for the
 * complete page tree, while route handlers remain stable and unprefixed.
 */
export function isLocalizedPagePath(pathname: string): boolean {
	return !isRouteHandlerPath(pathname) && !pathname.startsWith("/_next/");
}

async function canPreviewFutureBlogPost(request: NextRequest): Promise<boolean> {
	if (process.env.NODE_ENV === "development") {
		return true;
	}

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll: () => request.cookies.getAll(),
				setAll: (_cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
					// The normal session middleware handles cookie refreshes after this gate.
				},
			},
		}
	);

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return false;
	}

	const { data, error } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	return !error && data?.role === "admin";
}

async function blockFutureBlogPostUnlessPreviewAllowed(
	request: NextRequest
): Promise<NextResponse | null> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return null;
	}

	const publishedAt = getBlogSlugDate(request.nextUrl.pathname);
	if (!publishedAt || publishedAt.getTime() <= Date.now()) {
		return null;
	}

	if (await canPreviewFutureBlogPost(request)) {
		return null;
	}

	return new NextResponse(null, { status: 404 });
}

export async function proxy(request: NextRequest) {
	if (request.nextUrl.pathname === "/" && wantsMarkdown(request)) {
		const rewriteUrl = request.nextUrl.clone();
		rewriteUrl.pathname = "/__markdown";
		rewriteUrl.searchParams.set("path", "/");
		return NextResponse.rewrite(rewriteUrl);
	}

	if (withoutLocalePrefix(request.nextUrl.pathname).startsWith("/blog/")) {
		if (isRetiredBlogPath(request.nextUrl.pathname)) {
			return new NextResponse(null, { status: 404 });
		}

		const futureBlogResponse =
			await blockFutureBlogPostUnlessPreviewAllowed(request);
		if (futureBlogResponse) {
			return futureBlogResponse;
		}
	}

	if (isLocalizedPagePath(request.nextUrl.pathname)) {
		const i18nResponse = handleI18nRouting(request);
		if (!needsSessionMiddleware(request.nextUrl.pathname)) {
			return i18nResponse;
		}
		const sessionResponse = await updateSession(request);

		// Auth gates and MFA redirects must win over locale negotiation. For
		// normal pages, preserve any refreshed Supabase cookies on the i18n
		// response so both middlewares compose safely.
		if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
			return sessionResponse;
		}
		for (const cookie of sessionResponse.cookies.getAll()) {
			i18nResponse.cookies.set(cookie);
		}
		return i18nResponse;
	}

	return await updateSession(request);
}

export const config = {
	matcher: [
		{
			source: "/",
			has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
		},
		"/api/account/:path*",
		"/api/internal/:path*",
		"/api/chat/:path*",
		"/((?!api/|_next/|\\.well-known/|og/|.*\\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wasm|webmanifest|webp|woff2?|xml|zip)$).*)",
	],
};
