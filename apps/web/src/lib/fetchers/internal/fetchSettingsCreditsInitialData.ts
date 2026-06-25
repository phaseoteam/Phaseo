import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsCreditsInitialData } from "@/app/api/internal/settings/credits/initial/route";

export async function fetchSettingsCreditsInitialData(): Promise<SettingsCreditsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/credits/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch credits settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsCreditsInitialData;
}
