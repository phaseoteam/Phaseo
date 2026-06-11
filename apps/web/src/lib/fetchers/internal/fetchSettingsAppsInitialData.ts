import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsAppsInitialData } from "@/app/api/internal/settings/apps/initial/route";

export async function fetchSettingsAppsInitialData(): Promise<SettingsAppsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/apps/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch apps settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsAppsInitialData;
}
