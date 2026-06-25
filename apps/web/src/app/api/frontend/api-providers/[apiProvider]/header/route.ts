import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import getAPIProviderHeader from "@/lib/fetchers/api-providers/getAPIProviderHeader";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ apiProvider: string }> },
) {
	try {
		const { apiProvider } = await context.params;
		const header = await getAPIProviderHeader(apiProvider);
		return NextResponse.json(header, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/header] failed to fetch API provider header",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load API provider header" },
			{ status: 500 },
		);
	}
}
