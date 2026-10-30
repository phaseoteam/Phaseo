import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function accountBillingRequest<T>(
	path: `/api/account/settings/billing/${string}`,
	init: RequestInit = {},
): Promise<T> {
	return fetchAccountWebApi<T>(path, await getBrowserAccessToken(), init);
}
