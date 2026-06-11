import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsCreditsOnboardingInitialData } from "@/app/api/internal/settings/credits/onboarding/initial/route";

export async function fetchSettingsCreditsOnboardingInitialData(): Promise<SettingsCreditsOnboardingInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/credits/onboarding/initial"),
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
			`Failed to fetch billing onboarding settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsCreditsOnboardingInitialData;
}
