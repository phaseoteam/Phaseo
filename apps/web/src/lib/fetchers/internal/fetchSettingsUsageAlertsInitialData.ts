import type { SettingsUsageAlertsInitialData } from "@/app/api/internal/settings/usage/alerts/initial/route";
import { internalUrl, requestOrigin } from "@/lib/fetchers/internal/requestOrigin";

export async function fetchSettingsUsageAlertsInitialData(): Promise<SettingsUsageAlertsInitialData> {
	const { cookie, origin } = await requestOrigin();
	const response = await fetch(
		internalUrl(origin, "/api/internal/settings/usage/alerts/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie,
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch usage alerts settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsUsageAlertsInitialData;
}
