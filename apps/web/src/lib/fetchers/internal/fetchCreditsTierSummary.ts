import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { CreditsTierSummary } from "@/app/api/internal/credits/tier-summary/route";

export async function fetchCreditsTierSummary(
	workspaceId?: string,
): Promise<CreditsTierSummary> {
	const requestHeaders = await headers();
	const params = new URLSearchParams();
	if (workspaceId) params.set("workspaceId", workspaceId);
	const query = params.toString();
	const response = await fetch(
		absoluteUrl(`/api/internal/credits/tier-summary${query ? `?${query}` : ""}`),
		{
			cache: "no-store",
			headers: {
				accept: "application/json",
				cookie: requestHeaders.get("cookie") ?? "",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch credits tier summary: ${response.status}`);
	}

	return (await response.json()) as CreditsTierSummary;
}
