import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsOAuthAppDetailInitialData } from "@/app/api/internal/settings/oauth-apps/[clientId]/initial/route";

export async function fetchSettingsOAuthAppDetailInitialData(
	clientId: string,
): Promise<SettingsOAuthAppDetailInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl(
			`/api/internal/settings/oauth-apps/${encodeURIComponent(clientId)}/initial`,
		),
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
			`Failed to fetch OAuth app detail settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsOAuthAppDetailInitialData;
}
