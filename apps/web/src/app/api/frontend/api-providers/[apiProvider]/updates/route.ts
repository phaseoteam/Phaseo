import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAPIProviderUpdatesCached } from "@/lib/fetchers/api-providers/getAPIProviderUpdates";

export async function GET(
	_request: Request,
	context: { params: Promise<{ apiProvider: string }> },
) {
	try {
		const { apiProvider } = await context.params;
		const updates = await getAPIProviderUpdatesCached(apiProvider);
		return NextResponse.json(updates, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/updates] failed to fetch provider updates",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider updates" },
			{ status: 500 },
		);
	}
}
