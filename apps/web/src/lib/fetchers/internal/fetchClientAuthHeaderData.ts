import type { InternalAuthHeaderData } from "@/lib/fetchers/internal/authTypes";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchClientAuthHeaderData(): Promise<InternalAuthHeaderData> {
	return fetchAccountWebApi<InternalAuthHeaderData>(
		"/api/account/auth/header",
		await getBrowserAccessToken(),
	);
}
