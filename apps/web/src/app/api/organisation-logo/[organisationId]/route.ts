import { NextRequest, NextResponse } from "next/server";
import { resolveLogo } from "@/lib/logos";

const FALLBACK_LOGOS = {
	light: "/logo_light.svg",
	dark: "/logo_dark.svg",
} as const;

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ organisationId: string }> },
) {
	const { organisationId } = await params;
	const theme = request.nextUrl.searchParams.get("theme") === "dark" ? "dark" : "light";
	const resolved = resolveLogo(organisationId, { theme });
	const assetPath = resolved.src ?? FALLBACK_LOGOS[theme];
	const response = NextResponse.redirect(new URL(assetPath, request.url));
	response.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
	return response;
}
