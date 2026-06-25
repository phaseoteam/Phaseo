import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { SettingsPaymentMethodsInitialData } from "@/app/api/internal/settings/payment-methods/initial/route";

export async function fetchSettingsPaymentMethodsInitialData(): Promise<SettingsPaymentMethodsInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/settings/payment-methods/initial"),
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
			`Failed to fetch payment methods settings data: ${response.status}`,
		);
	}

	return (await response.json()) as SettingsPaymentMethodsInitialData;
}
