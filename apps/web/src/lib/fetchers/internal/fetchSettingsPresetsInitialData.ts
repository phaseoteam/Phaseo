import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsPresetsInitialData } from "@/app/api/internal/settings/presets/initial/route";

export async function fetchSettingsPresetsInitialData(): Promise<SettingsPresetsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/presets/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch presets settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsPresetsInitialData;
}
