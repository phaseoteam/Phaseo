import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";

export async function GET() {
	try {
		const providers = await getAllAPIProvidersCached();
		return NextResponse.json(providers, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers] failed to fetch API providers",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load API providers" },
			{ status: 500 },
		);
	}
}
