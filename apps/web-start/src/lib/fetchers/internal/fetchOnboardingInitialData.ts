import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

export async function fetchOnboardingInitialData(): Promise<{
	signedIn: boolean;
	user: { onboarding_state?: unknown; onboarding_completed_at?: string | null; default_workspace_id?: string | null; declared_country_code?: string | null; country_declared_at?: string | null } | null;
	countryStorageAvailable?: boolean;
	workspaces: Array<{ workspace_id: string; role: string; workspaces: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null }>;
}> {
	const { accessToken } = await getServerAccountContext();
	return fetchAccountWebApi("/api/account/auth/onboarding", accessToken);
}
