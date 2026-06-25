import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import getOrganisationOverviewHeader from "@/lib/fetchers/organisations/getOrganisationOverviewHeader";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string }> },
) {
	try {
		const { organisationId } = await context.params;
		const header = await getOrganisationOverviewHeader(organisationId);
		return NextResponse.json(header, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/organisations/header] failed to fetch organisation header",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load organisation header" },
			{ status: 500 },
		);
	}
}
