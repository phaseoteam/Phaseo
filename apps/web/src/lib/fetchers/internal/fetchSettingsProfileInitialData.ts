import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsProfileInitialData } from "@/app/api/internal/settings/profile/initial/route";

export async function fetchSettingsProfileInitialData(): Promise<SettingsProfileInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/profile/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch profile settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsProfileInitialData;
}
