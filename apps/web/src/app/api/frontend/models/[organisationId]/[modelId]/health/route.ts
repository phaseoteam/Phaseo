import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelProviderHealthMetricsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";

function parseList(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

function parseBoundedInt(
	value: string | null,
	defaultValue: number,
	min: number,
	max: number,
): number {
	const parsed = value ? Number.parseInt(value, 10) : defaultValue;
	if (!Number.isFinite(parsed)) return defaultValue;
	return Math.max(min, Math.min(max, parsed));
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const health = await getModelProviderHealthMetricsCached({
			modelId: fullModelId,
			providerIds: parseList(request, "providerId"),
			modelAliases: parseList(request, "modelAlias"),
			windowDays: parseBoundedInt(
				request.nextUrl.searchParams.get("windowDays"),
				30,
				1,
				90,
			),
			bucketHours: parseBoundedInt(
				request.nextUrl.searchParams.get("bucketHours"),
				24,
				1,
				24 * 7,
			),
		});
		return NextResponse.json(health, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/health] failed", error);
		return NextResponse.json(
			{ error: "Failed to load model health metrics" },
			{ status: 500 },
		);
	}
}
