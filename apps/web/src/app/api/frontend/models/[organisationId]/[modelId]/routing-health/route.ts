import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelProviderRoutingHealthCached } from "@/lib/fetchers/models/getModelProviderRoutingHealth";

function parseList(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

function parseWindowHours(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 24;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(24 * 14, parsed)) : 24;
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const health = await getModelProviderRoutingHealthCached({
			providerIds: parseList(request, "providerId"),
			windowHours: parseWindowHours(request.nextUrl.searchParams.get("windowHours")),
		});
		return NextResponse.json(health, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/routing-health] failed", error);
		return NextResponse.json(
			{ error: "Failed to load routing health" },
			{ status: 500 },
		);
	}
}
