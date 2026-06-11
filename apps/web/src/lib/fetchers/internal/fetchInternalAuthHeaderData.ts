import type { InternalAuthHeaderData } from "@/app/api/internal/auth/header/route";
import { internalUrl, requestOrigin } from "@/lib/fetchers/internal/requestOrigin";

export async function fetchInternalAuthHeaderData(): Promise<InternalAuthHeaderData> {
	const { cookie, origin } = await requestOrigin();
	const response = await fetch(internalUrl(origin, "/api/internal/auth/header"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch auth header data: ${response.status}`);
	}

	return (await response.json()) as InternalAuthHeaderData;
}
