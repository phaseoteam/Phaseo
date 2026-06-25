import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/seo";
import type { RedeemInitialData } from "@/app/api/internal/redeem/initial/route";

export async function fetchRedeemInitialData(): Promise<RedeemInitialData> {
	const requestHeaders = await headers();
	const response = await fetch(absoluteUrl("/api/internal/redeem/initial"), {
		cache: "no-store",
		headers: {
			accept: "application/json",
			cookie: requestHeaders.get("cookie") ?? "",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch redeem initial data: ${response.status}`);
	}

	return (await response.json()) as RedeemInitialData;
}
