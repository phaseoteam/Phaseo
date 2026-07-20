import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { updateSession } from "@/utils/supabase/middleware";

const RETIRED_BLOG_SLUGS = new Set([
	"security-notice-key-rotation-vercel-2026-04-19",
]);

function wantsMarkdown(request: NextRequest): boolean {
	const accept = request.headers.get("accept")?.toLowerCase() ?? "";
	return request.method === "GET" && accept.includes("text/markdown");
}

function getBlogSlugDate(pathname: string): Date | null {
	const slug = pathname.replace(/^\/blog\//, "").split("/")[0];
	const match = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		return null;
	}

	const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isRetiredBlogPath(pathname: string): boolean {
	const slug = pathname.replace(/^\/blog\//, "").split("/")[0];
	return RETIRED_BLOG_SLUGS.has(slug);
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

	const { data: sessionData } = await supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;
	if (!accessToken) return false;
	const origin = (process.env.WEB_API_ORIGIN ?? "https://phaseo.app").replace(/\/+$/, "");
	try {
		const response = await fetch(`${origin}/api/account/auth/status`, {
			headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
			cache: "no-store",
		});
		if (!response.ok) return false;
		const status = await response.json() as { isAdmin?: unknown };
		return status.isAdmin === true;
	} catch {
		return false;
	}
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

	if (request.nextUrl.pathname.startsWith("/blog/")) {
		if (isRetiredBlogPath(request.nextUrl.pathname)) {
			return new NextResponse(null, { status: 404 });
		}

		const futureBlogResponse =
			await blockFutureBlogPostUnlessPreviewAllowed(request);
		if (futureBlogResponse) {
			return futureBlogResponse;
		}
	}

	return await updateSession(request);
}

export const config = {
	matcher: [
		{
			source: "/",
			has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
		},
		"/blog/:path*",
		"/settings/:path*",
		"/chat/:path*",
	],
};
