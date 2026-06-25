import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getPublicProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ slug: string }> },
) {
	try {
		const { slug } = await context.params;
		const profile = await getPublicProfileSnapshot(slug);
		return NextResponse.json(profile, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load profile" },
			{ status: 500 },
		);
	}
}
