import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { resolveCanonicalModelId } from "@/lib/fetchers/models/resolveCanonicalModelId";

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
		const resolved = await resolveCanonicalModelId(
			fullModelId,
			includeHidden,
		);
		return NextResponse.json(resolved, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/models/canonical] failed to resolve canonical model",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to resolve canonical model" },
			{ status: 500 },
		);
	}
}
