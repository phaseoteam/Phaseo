import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsAccountDetailsInitialData } from "@/app/api/internal/settings/account/details/initial/route";

export async function fetchSettingsAccountDetailsInitialData(): Promise<SettingsAccountDetailsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/account/details/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch account settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsAccountDetailsInitialData;
}
