import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getOrganisationModelsCached } from "@/lib/fetchers/organisations/getOrganisation";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ organisationId: string }> },
) {
	try {
		const { organisationId } = await context.params;
		const models = await getOrganisationModelsCached(organisationId, false);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/organisations/models] failed to fetch organisation models",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load organisation models" },
			{ status: 500 },
		);
	}
}
