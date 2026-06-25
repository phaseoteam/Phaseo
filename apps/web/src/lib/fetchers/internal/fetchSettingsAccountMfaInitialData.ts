import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsAccountMfaInitialData } from "@/app/api/internal/settings/account/mfa/initial/route";

export async function fetchSettingsAccountMfaInitialData(): Promise<SettingsAccountMfaInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/account/mfa/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch MFA settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsAccountMfaInitialData;
}
