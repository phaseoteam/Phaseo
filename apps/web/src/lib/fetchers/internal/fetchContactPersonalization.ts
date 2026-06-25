import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { ContactPersonalizationData } from "@/app/api/internal/contact/personalization/route";

export async function fetchContactPersonalization(): Promise<ContactPersonalizationData> {
	const requestHeaders = await headers();
	const response = await fetch(
		absoluteUrl("/api/internal/contact/personalization"),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch contact personalization: ${response.status}`);
	}

	return (await response.json()) as ContactPersonalizationData;
}
