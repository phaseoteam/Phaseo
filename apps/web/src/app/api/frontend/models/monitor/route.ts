import { NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";

export async function GET() {
	try {
		const result = await getMonitorModels({}, false);
		return NextResponse.json(result, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models/monitor] failed to fetch monitor models", error);
		return NextResponse.json(
			{ error: "Failed to load monitor models" },
			{ status: 500 },
		);
	}
}
