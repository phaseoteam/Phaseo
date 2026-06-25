import type { SettingsLayoutInitialData } from "@/app/api/internal/settings/layout/initial/route";
import { internalUrl, requestOrigin } from "@/lib/fetchers/internal/requestOrigin";

export async function fetchSettingsLayoutInitialData(): Promise<SettingsLayoutInitialData> {
	const { cookie, origin } = await requestOrigin();
	const response = await fetch(internalUrl(origin, "/api/internal/settings/layout/initial"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch settings layout data: ${response.status}`);
	}

	return (await response.json()) as SettingsLayoutInitialData;
}
