import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type WorkspaceAuditEvent = {
	id: string;
	actor_user_id: string | null;
	actor: { displayName: string | null; email: string | null } | null;
	action: string;
	target_type: string;
	target_id: string;
	target_name: string | null;
	metadata: Record<string, unknown>;
	request_id: string | null;
	created_at: string;
};

export async function fetchSettingsAuditEvents(cursor?: string | null): Promise<{
	events: WorkspaceAuditEvent[];
	nextCursor: string | null;
	workspaceId: string | null;
}> {
	const context = await getServerAccountContext();
	if (!context.workspaceId) return { events: [], nextCursor: null, workspaceId: null };
	const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
	return fetchAccountWebApi(
		`/api/account/settings/audit-events?workspaceId=${encodeURIComponent(context.workspaceId)}${cursorQuery}`,
		context.accessToken,
	);
}
