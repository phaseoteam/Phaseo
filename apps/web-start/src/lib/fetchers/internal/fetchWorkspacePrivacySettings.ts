import type { WorkspacePrivacySettings } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export async function fetchWorkspacePrivacySettings(): Promise<WorkspacePrivacySettings | null> {
	const context = await getServerAccountContext();
	if (!context.workspaceId || !context.accessToken) return null;
	return fetchAccountWebApi<WorkspacePrivacySettings | null>(
		`/api/account/settings/workspace/privacy-settings?workspaceId=${encodeURIComponent(context.workspaceId)}`,
		context.accessToken,
	);
}
