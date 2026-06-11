import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsOAuthAppsInitialData } from "@/app/api/internal/settings/oauth-apps/initial/route";

export async function fetchSettingsOAuthAppsInitialData(): Promise<SettingsOAuthAppsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/oauth-apps/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch OAuth apps settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsOAuthAppsInitialData;
}
