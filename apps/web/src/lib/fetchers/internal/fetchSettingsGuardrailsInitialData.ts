import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsGuardrailsInitialData } from "@/app/api/internal/settings/guardrails/initial/route";

export async function fetchSettingsGuardrailsInitialData(): Promise<SettingsGuardrailsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/guardrails/initial"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch guardrails settings data: ${response.status}`);
	}

	return (await response.json()) as SettingsGuardrailsInitialData;
}
