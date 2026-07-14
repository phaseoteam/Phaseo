import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelPageNotice } from "@/lib/fetchers/models/getModelPageNotice";

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
		const notice = await getModelPageNotice(fullModelId, includeHidden);
		return NextResponse.json(notice, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/notice] failed to fetch model notice", error);
		return NextResponse.json(
			{ error: "Failed to load model notice" },
			{ status: 500 },
		);
	}
}
