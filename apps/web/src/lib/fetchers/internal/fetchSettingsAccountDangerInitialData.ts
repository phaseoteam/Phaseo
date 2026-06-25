import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsAccountDangerInitialData } from "@/app/api/internal/settings/account/danger/initial/route";

export async function fetchSettingsAccountDangerInitialData(): Promise<SettingsAccountDangerInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/account/danger/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch danger zone settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsAccountDangerInitialData;
}
