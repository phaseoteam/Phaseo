import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPendingApiReleaseState } from "@/lib/fetchers/models/getModelPendingApiReleaseState";

function parseBoolean(value: string | null): boolean {
	return value === "1" || value === "true";
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const includeHidden = parseBoolean(
			request.nextUrl.searchParams.get("includeHidden"),
		);
		const state = await getModelPendingApiReleaseState(
			fullModelId,
			includeHidden,
		);
		return NextResponse.json(state, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/pending-api-release] failed to fetch pending API release state",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load pending API release state" },
			{ status: 500 },
		);
	}
}
