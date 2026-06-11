import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsByokInitialData } from "@/app/api/internal/settings/byok/initial/route";

export async function fetchSettingsByokInitialData(): Promise<SettingsByokInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/byok/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch BYOK settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsByokInitialData;
}
