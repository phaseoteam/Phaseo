import type { InternalAuthStatus } from "@/app/api/internal/auth/status/route";
import { internalUrl, requestOrigin } from "@/lib/fetchers/internal/requestOrigin";

export async function fetchInternalAuthStatus(): Promise<InternalAuthStatus> {
	const { cookie, origin } = await requestOrigin();
	const response = await fetch(internalUrl(origin, "/api/internal/auth/status"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch auth status: ${response.status}`);
	}

	return (await response.json()) as InternalAuthStatus;
}
