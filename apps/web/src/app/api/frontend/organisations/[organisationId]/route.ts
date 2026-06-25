import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getOrganisationDataCached } from "@/lib/fetchers/organisations/getOrganisation";

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string }> },
) {
	await connection();
	try {
		const { organisationId } = await context.params;
		const rawLimit = request.nextUrl.searchParams.get("limit");
		const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 12;
		const organisation = await getOrganisationDataCached(
			organisationId,
			Number.isFinite(limit) ? limit : 12,
			false,
		);
		return NextResponse.json(organisation, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/organisations/detail] failed to fetch organisation",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load organisation" },
			{ status: 500 },
		);
	}
}
