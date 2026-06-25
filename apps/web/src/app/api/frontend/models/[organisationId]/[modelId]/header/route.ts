import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";

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
		const header = await getModelOverviewHeader(
			fullModelId,
			includeHidden,
		);
		return NextResponse.json(header, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/header] failed to fetch model header", error);
		return NextResponse.json(
			{ error: "Failed to load model header" },
			{ status: 500 },
		);
	}
}
