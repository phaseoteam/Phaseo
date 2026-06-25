import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsPrivacyInitialData } from "@/app/api/internal/settings/privacy/initial/route";

export async function fetchSettingsPrivacyInitialData(): Promise<SettingsPrivacyInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/privacy/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch privacy settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsPrivacyInitialData;
}
