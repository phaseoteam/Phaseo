import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getTopModelsCached } from "@/lib/fetchers/api-providers/api-provider/top-models";

function parseCount(value: string | null, fallback: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : fallback;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ apiProvider: string }> },
) {
	await connection();
	try {
		const { apiProvider } = await context.params;
		const count = parseCount(request.nextUrl.searchParams.get("count"), 6);
		const models = await getTopModelsCached(apiProvider, false, count);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/api-providers/top-models] failed to fetch models",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider top models" },
			{ status: 500 },
		);
	}
}
