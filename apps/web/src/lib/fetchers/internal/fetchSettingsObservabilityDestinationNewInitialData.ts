import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsObservabilityDestinationNewInitialData } from "@/app/api/internal/settings/observability/destinations/new/[provider]/initial/route";

export async function fetchSettingsObservabilityDestinationNewInitialData(
	provider: string,
): Promise<SettingsObservabilityDestinationNewInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl(
			`/api/internal/settings/observability/destinations/new/${encodeURIComponent(provider)}/initial`,
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
			`Failed to fetch destination creation data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsObservabilityDestinationNewInitialData;
}
