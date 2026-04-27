import { getSupabaseAdmin } from "@/runtime/env";

type WorkspaceUsageRollupSyncArgs = {
	requestRowId: string;
	requestCreatedAt: string;
	workspaceId: string;
	context: string;
};

export async function syncWorkspaceUsageRollupForRequest(
	args: WorkspaceUsageRollupSyncArgs,
): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase.rpc("upsert_gateway_request_into_workspace_usage_rollup", {
		p_request_row_id: args.requestRowId,
		p_request_created_at: args.requestCreatedAt,
		p_workspace_id: args.workspaceId,
	});

	if (error) {
		throw new Error(
			`[${args.context}] sync workspace usage rollup error: ${error.message ?? "unknown"}`,
		);
	}
}
