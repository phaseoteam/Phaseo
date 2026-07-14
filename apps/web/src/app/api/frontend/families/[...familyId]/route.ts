import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getFamilyModelsCached } from "@/lib/fetchers/models/getFamilyModels";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ familyId: string[] }> },
) {
	try {
		const { familyId } = await context.params;
		const family = await getFamilyModelsCached(familyId.join("/"), false);
		return NextResponse.json(family, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/families/detail] failed to fetch family", error);
		return NextResponse.json(
			{ error: "Failed to load family" },
			{ status: 500 },
		);
	}
}
