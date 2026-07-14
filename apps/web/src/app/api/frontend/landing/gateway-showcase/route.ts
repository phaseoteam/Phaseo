import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import {
	getAppImageUrlsByIds,
	getTopApps,
	getTopModelsWithMetadata,
} from "@/lib/fetchers/rankings/getRankingsData";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";

function parseLimit(value: string | null, fallback: number, max: number): number {
	const parsed = value ? Number.parseInt(value, 10) : fallback;
	return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
}

export type FrontendGatewayShowcaseData = {
	appImageUrls: Record<string, string | null>;
	metrics: Awaited<ReturnType<typeof getGatewayMarketingMetrics>>;
	topApps: Awaited<ReturnType<typeof getTopApps>>;
	topModels: Awaited<ReturnType<typeof getTopModelsWithMetadata>>;
};

export async function GET(request: NextRequest) {
	await connection();
	try {
		const monthlyWindowHours = 24 * 30;
		const topModelsLimit = parseLimit(
			request.nextUrl.searchParams.get("topModelsLimit"),
			6,
			25,
		);
		const topAppsLimit = parseLimit(
			request.nextUrl.searchParams.get("topAppsLimit"),
			25,
			50,
		);
		const [metrics, topModels, topApps] = await Promise.all([
			getGatewayMarketingMetrics(monthlyWindowHours),
			getTopModelsWithMetadata("week", topModelsLimit),
			getTopApps("week", topAppsLimit),
		]);
		const topAppRows = [...(topApps.data ?? [])]
			.filter((row) => Number(row.tokens ?? 0) > 0)
			.filter((row) => Boolean(row.app_id))
			.sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
			.slice(0, 6);
		const appIds = Array.from(
			new Set(topAppRows.map((row) => row.app_id).filter(Boolean)),
		);
		const appImageUrls = await getAppImageUrlsByIds(appIds);

		return NextResponse.json(
			{ appImageUrls, metrics, topApps, topModels } satisfies FrontendGatewayShowcaseData,
			{ headers: PUBLIC_CDN_CACHE_HEADERS },
		);
	} catch {
		return NextResponse.json(
			{ error: "Failed to load gateway showcase data" },
			{ status: 500 },
		);
	}
}
