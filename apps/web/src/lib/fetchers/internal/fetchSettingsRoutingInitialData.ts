import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsRoutingInitialData } from "@/app/api/internal/settings/routing/initial/route";

export async function fetchSettingsRoutingInitialData(): Promise<SettingsRoutingInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/routing/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch routing settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsRoutingInitialData;
}
