import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";

function parseList(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const stats = await getModelProviderRuntimeStatsCached({
			modelId: fullModelId,
			providerIds: parseList(request, "providerId"),
			modelAliases: parseList(request, "modelAlias"),
		});
		return NextResponse.json(stats, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/runtime-stats] failed", error);
		return NextResponse.json(
			{ error: "Failed to load runtime stats" },
			{ status: 500 },
		);
	}
}
