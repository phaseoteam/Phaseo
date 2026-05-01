import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

function wantsMarkdown(request: NextRequest): boolean {
	const accept = request.headers.get("accept")?.toLowerCase() ?? "";
	return request.method === "GET" && accept.includes("text/markdown");
}

export async function proxy(request: NextRequest) {
	if (request.nextUrl.pathname === "/" && wantsMarkdown(request)) {
		const rewriteUrl = request.nextUrl.clone();
		rewriteUrl.pathname = "/__markdown";
		rewriteUrl.searchParams.set("path", "/");
		return NextResponse.rewrite(rewriteUrl);
	}

	return await updateSession(request);
}

export const config = {
	matcher: ["/", "/settings/:path*", "/chat/:path*", "/api/chat/:path*"],
};
