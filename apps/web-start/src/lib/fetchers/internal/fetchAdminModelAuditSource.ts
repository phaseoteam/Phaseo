import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

async function fetchAdminSource<T>(path: `/api/account/${string}`): Promise<T> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return fetchAccountWebApi<T>(path, accessToken);
}

export async function fetchAdminModelAuditSource(includeHidden: boolean): Promise<{
	models: any[];
	providerRows: any[];
	benchmarkRows: any[];
	pricingRows: any[];
}> {
	return fetchAdminSource(`/api/account/models/audit/source?includeHidden=${includeHidden ? "true" : "false"}`);
}

export async function fetchAdminProviderAuditSource(): Promise<{
	providerModels: any[];
	pricingRules: any[];
}> {
	return fetchAdminSource("/api/account/models/provider-audit/source");
}
