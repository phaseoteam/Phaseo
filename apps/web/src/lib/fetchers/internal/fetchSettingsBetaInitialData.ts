import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsBetaInitialData } from "@/app/api/internal/settings/beta/initial/route";

export async function fetchSettingsBetaInitialData(): Promise<SettingsBetaInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/beta/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch beta settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsBetaInitialData;
}
