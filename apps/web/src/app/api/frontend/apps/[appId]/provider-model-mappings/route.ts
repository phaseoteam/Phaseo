import { connection, NextRequest, NextResponse } from "next/server";
import { PUBLIC_CDN_CACHE_HEADERS } from "@/lib/cache/publicCacheHeaders";
import { createAdminClient } from "@/utils/supabase/admin";

type ProviderModelMapping = {
	provider_id: string | null;
	api_model_id: string | null;
	model_id: string | null;
};

function parseList(request: NextRequest, key: string): string[] {
	return request.nextUrl.searchParams
		.getAll(key)
		.flatMap((value) => value.split(","))
		.map((value) => value.trim())
		.filter(Boolean);
}

export async function GET(request: NextRequest) {
	await connection();
	try {
		const apiLookupIds = parseList(request, "apiLookupId");
		const providerIds = parseList(request, "providerId");

		if (apiLookupIds.length === 0) {
			return NextResponse.json([], {
				headers: PUBLIC_CDN_CACHE_HEADERS,
			});
		}

		const supabase = createAdminClient();
		let query = supabase
			.from("data_api_provider_models")
			.select("provider_id, api_model_id, model_id")
			.in("api_model_id", apiLookupIds)
			.not("model_id", "is", null);

		if (providerIds.length > 0) {
			query = query.in("provider_id", providerIds);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(
				`Failed to load provider model mappings: ${error.message}`,
			);
		}

		return NextResponse.json((data ?? []) as ProviderModelMapping[], {
			headers: PUBLIC_CDN_CACHE_HEADERS,
		});
	} catch (error) {
		console.error(
			"[api/frontend/apps/provider-model-mappings] failed to fetch mappings",
			error,
		);
		return NextResponse.json(
			{ error: "Failed to load provider model mappings" },
			{ status: 500 },
		);
	}
}
