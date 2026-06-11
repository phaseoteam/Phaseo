import type { InternalAuthStatsigData } from "@/app/api/internal/auth/statsig/route";

export async function fetchClientAuthStatsigData(): Promise<InternalAuthStatsigData> {
	const response = await fetch("/api/internal/auth/statsig", {
		cache: "no-store",
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Statsig auth data: ${response.status}`);
	}

	return (await response.json()) as InternalAuthStatsigData;
}
