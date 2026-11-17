import type { ModelAccess } from "@/lib/chat/modelAccess";
import { getServerAccountContext } from "./serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

/**
 * The models the signed-in member may use in the workspace picked in the header (the activeWorkspaceId cookie).
 * Null when signed out or no workspace is picked; throws when the check fails, so callers can tell "nothing hidden"
 * from "don't know".
 */
export async function fetchModelAccess(): Promise<ModelAccess | null> {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return null;
	return fetchAccountWebApi<ModelAccess>(
		`/api/account/settings/models/access?workspaceId=${encodeURIComponent(context.workspaceId)}`,
		context.accessToken,
	);
}
