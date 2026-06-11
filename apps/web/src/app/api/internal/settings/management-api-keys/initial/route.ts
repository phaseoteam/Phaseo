import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";

export type SettingsManagementApiKeysInitialData = {
	currentUserId: string | undefined;
	teamsWithKeys: Array<{
		id: string;
		keys: any[];
		name: string;
	}>;
	workspace: {
		id: string;
		name: string;
	} | null;
};

export async function GET() {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	const {
		data: { user },
	} = await supabase.auth.getUser();
	const activeWorkspaceId = String((await getWorkspaceIdFromCookie()) ?? "").trim();

	if (!activeWorkspaceId) {
		return NextResponse.json({
			currentUserId: user?.id,
			teamsWithKeys: [],
			workspace: null,
		} satisfies SettingsManagementApiKeysInitialData);
	}

	const [{ data: activeWorkspace, error: workspaceError }, { data: managementKeys, error: keysError }] =
		await Promise.all([
			readClient
				.from("workspaces")
				.select("id, name")
				.eq("id", activeWorkspaceId)
				.maybeSingle(),
			readClient
				.from("management_keys")
				.select("*")
				.eq("workspace_id", activeWorkspaceId)
				.order("created_at", { ascending: false }),
		]);

	if (workspaceError) throw new Error(workspaceError.message);
	if (keysError) throw new Error(keysError.message);

	const workspaceName =
		String((activeWorkspace as any)?.name ?? "").trim() || "Current Workspace";
	const workspace = {
		id: activeWorkspaceId,
		name: workspaceName,
	};

	return NextResponse.json({
		currentUserId: user?.id,
		teamsWithKeys: [
			{
				...workspace,
				keys: (managementKeys ?? []).map((key: any) => ({ ...key })),
			},
		],
		workspace,
	} satisfies SettingsManagementApiKeysInitialData);
}
