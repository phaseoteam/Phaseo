import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type RedeemInitialData = {
	activeWorkspaceId: string | null;
	invoiceTeamIds: string[];
	signedIn: boolean;
	teamOptions: Array<{ id: string; name: string }>;
};

export async function fetchRedeemInitialData(): Promise<RedeemInitialData> {
	const { accessToken, workspaceId } = await getServerAccountContext();
	if (!accessToken) return { activeWorkspaceId: null, invoiceTeamIds: [], signedIn: false, teamOptions: [] };
	const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
	return fetchAccountWebApi<RedeemInitialData>(`/api/account/credits/redeem-initial${query}`, accessToken);
}
