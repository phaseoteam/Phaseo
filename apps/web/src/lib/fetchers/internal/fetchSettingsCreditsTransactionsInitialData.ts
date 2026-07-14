import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsCreditsTransactionsInitialData } from "@/app/api/internal/settings/credits/transactions/initial/route";

export async function fetchSettingsCreditsTransactionsInitialData(): Promise<SettingsCreditsTransactionsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/credits/transactions/initial"),
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
			`Failed to fetch credits transactions settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsCreditsTransactionsInitialData;
}
