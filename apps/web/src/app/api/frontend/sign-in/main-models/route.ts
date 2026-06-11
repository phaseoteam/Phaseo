import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { getMainModelsCached } from "@/lib/fetchers/landing/sign-in/getMainModels";

function parseBoolean(value: string | null): boolean {
	return value === "1" || value === "true";
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const modelIds = request.nextUrl.searchParams
			.getAll("modelId")
			.map((modelId) => modelId.trim())
			.filter(Boolean);
		const models = await getMainModelsCached(
			modelIds,
			parseBoolean(request.nextUrl.searchParams.get("includeHidden")),
		);
		return NextResponse.json(models, {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load sign-in models" },
			{ status: 500 },
		);
	}
}
