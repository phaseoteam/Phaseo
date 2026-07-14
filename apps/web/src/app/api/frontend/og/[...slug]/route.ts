import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import {
	getFrontendOgPayload,
	type OgEntity,
} from "@/lib/fetchers/frontend/getOgPayload";

const OG_ENTITIES = new Set<string>([
	"organisations",
	"models",
	"benchmarks",
	"api-providers",
	"countries",
	"subscription-plans",
]);

export async function GET(
	_request: NextRequest,
	context: { params: Promise<{ slug?: string[] }> },
) {
	try {
		const { slug = [] } = await context.params;
		const [kindRaw, ...segments] = slug;
		if (!kindRaw || !OG_ENTITIES.has(kindRaw)) {
			return NextResponse.json(null, {
				headers: PUBLIC_CDN_CACHE_HEADERS,
			});
		}

		const payload = await getFrontendOgPayload(kindRaw as OgEntity, segments);
		return NextResponse.json(payload, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load OG payload" },
			{ status: 500 },
		);
	}
}
