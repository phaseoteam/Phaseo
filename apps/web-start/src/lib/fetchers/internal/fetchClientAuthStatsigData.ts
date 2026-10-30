import type { InternalAuthStatsigData } from "@/lib/fetchers/internal/authTypes";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchClientAuthStatsigData(): Promise<InternalAuthStatsigData> {
	return fetchAccountWebApi<InternalAuthStatsigData>(
		"/api/account/auth/statsig",
		await getBrowserAccessToken(),
	);
}
