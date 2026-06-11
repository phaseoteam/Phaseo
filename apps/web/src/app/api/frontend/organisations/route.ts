import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAllOrganisationsCached } from "@/lib/fetchers/organisations/getAllOrganisations";

export async function GET() {
	try {
		const organisations = await getAllOrganisationsCached();
		return NextResponse.json(organisations, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/organisations] failed to fetch organisations",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load organisations" },
			{ status: 500 },
		);
	}
}
