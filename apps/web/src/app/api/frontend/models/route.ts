import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import {
	getFrontendModelsApiPayload,
	getFrontendModelsPayload,
} from "@/lib/fetchers/frontend/getFrontendModelsPayload";

export async function GET(request: Request) {
	await connection();
	try {
		const includeRaw = new URL(request.url).searchParams
			.get("include")
			?.split(",")
			.map((value) => value.trim().toLowerCase())
			.includes("raw");
		const models = includeRaw
			? await getFrontendModelsPayload()
			: await getFrontendModelsApiPayload();
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error("[api/frontend/models] failed to fetch models", error);
		return NextResponse.json(
			{ error: "Failed to load models" },
			{ status: 500 },
		);
	}
}
