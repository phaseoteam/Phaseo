import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getGatewaySupportedModels } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";

export async function GET() {
	try {
		const models = await getGatewaySupportedModels(false, {
			availableOnly: true,
		});
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/gateway-models] failed to fetch gateway models",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load gateway models" },
			{ status: 500 },
		);
	}
}
