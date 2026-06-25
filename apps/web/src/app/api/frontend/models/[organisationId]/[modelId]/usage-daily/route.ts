import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getModelUsageDailyBreakdownCached } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";

function parseList(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

function parseDays(value: string | null): number {
	const parsed = value ? Number.parseInt(value, 10) : 30;
	return Number.isFinite(parsed) ? Math.max(1, Math.min(365, parsed)) : 30;
}

function parseDate(value: string | null): string | undefined {
	const text = String(value ?? "").trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ organisationId: string; modelId: string }> },
) {
	await connection();
	try {
		const { organisationId, modelId } = await context.params;
		const fullModelId = `${organisationId}/${modelId}`;
		const rows = await getModelUsageDailyBreakdownCached({
			modelId: fullModelId,
			modelAliases: parseList(request, "modelAlias"),
			providerIds: parseList(request, "providerId"),
			days: parseDays(request.nextUrl.searchParams.get("days")),
			since: parseDate(request.nextUrl.searchParams.get("since")),
			until: parseDate(request.nextUrl.searchParams.get("until")),
		});

		return NextResponse.json(rows, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/usage-daily] failed", error);
		return NextResponse.json(
			{ error: "Failed to load model daily usage" },
			{ status: 500 },
		);
	}
}
