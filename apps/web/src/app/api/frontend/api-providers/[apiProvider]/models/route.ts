import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAPIProviderModelsListByModelDateCached } from "@/lib/fetchers/api-providers/getAPIProvider";

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ apiProvider: string }> },
) {
	try {
		const { apiProvider } = await context.params;
		const models = await getAPIProviderModelsListByModelDateCached(
			apiProvider,
			false,
		);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/models] failed to fetch API provider models",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load API provider models" },
			{ status: 500 },
		);
	}
}
