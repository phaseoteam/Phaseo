import { NextResponse } from "next/server";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
	const account = await getServerAccountContext();
	if (!account.accessToken) {
		return NextResponse.json(
			{ error: "unauthorized" },
			{ status: 401, headers: NO_STORE_HEADERS },
		);
	}

	const requestedProvider = new URL(request.url).searchParams.get("providerSlug");
	const query = requestedProvider
		? `?providerSlug=${encodeURIComponent(requestedProvider)}`
		: "";

	try {
		const payload = await fetchAccountWebApi<{
			authenticated?: boolean;
			isAdmin?: boolean;
			models?: unknown[];
		}>(
			`/api/account/settings/provider-onboarding/catalogue-previews${query}`,
			account.accessToken,
		);
		return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
	} catch (error) {
		if (error instanceof WebApiError) {
			return NextResponse.json(
				{ error: error.detail ?? "provider_catalog_preview_unavailable" },
				{ status: error.status, headers: NO_STORE_HEADERS },
			);
		}
		return NextResponse.json(
			{ error: "provider_catalog_preview_unavailable" },
			{ status: 503, headers: NO_STORE_HEADERS },
		);
	}
}
