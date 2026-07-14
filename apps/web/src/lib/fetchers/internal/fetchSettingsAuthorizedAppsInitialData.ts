import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsAuthorizedAppsInitialData } from "@/app/api/internal/settings/authorized-apps/initial/route";

export async function fetchSettingsAuthorizedAppsInitialData(): Promise<SettingsAuthorizedAppsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/authorized-apps/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(
			`Failed to fetch authorized apps settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsAuthorizedAppsInitialData;
}
