import type { SettingsUsageLogsInitialData } from "@/app/api/internal/settings/usage/logs/initial/route";
import { internalUrl, requestOrigin } from "@/lib/fetchers/internal/requestOrigin";

export async function fetchSettingsUsageLogsInitialData(
	searchParams: Record<string, string | string[] | undefined> | undefined,
): Promise<SettingsUsageLogsInitialData> {
	const { cookie, origin } = await requestOrigin();
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(searchParams ?? {})) {
		if (Array.isArray(value)) {
			for (const item of value) params.append(key, item);
		} else if (typeof value === "string") {
			params.set(key, value);
		}
	}
	const query = params.toString();
	const response = await fetch(
		internalUrl(origin, `/api/internal/settings/usage/logs/initial${query ? `?${query}` : ""}`),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie,
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch usage logs settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsUsageLogsInitialData;
}
