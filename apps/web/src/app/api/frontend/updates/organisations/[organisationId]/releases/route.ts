import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getOrganisationReleaseEvents } from "@/lib/fetchers/updates/getModelUpdates";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string }> },
) {
	try {
		const { organisationId } = await context.params;
		const events = await getOrganisationReleaseEvents(organisationId);
		return NextResponse.json(events, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/updates/organisation-releases] failed", error);
		return NextResponse.json(
			{ error: "Failed to load organisation releases" },
			{ status: 500 },
		);
	}
}
