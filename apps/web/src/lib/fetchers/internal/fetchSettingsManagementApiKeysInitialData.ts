import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsManagementApiKeysInitialData } from "@/app/api/internal/settings/management-api-keys/initial/route";

export async function fetchSettingsManagementApiKeysInitialData(): Promise<SettingsManagementApiKeysInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/management-api-keys/initial"),
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
			`Failed to fetch management API keys settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsManagementApiKeysInitialData;
}
