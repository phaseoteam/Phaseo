import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export async function fetchAdminCreditGrants(): Promise<any[]> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return (await fetchAccountWebApi<{ grants: any[] }>("/api/account/credits/admin/grants", accessToken)).grants;
}
