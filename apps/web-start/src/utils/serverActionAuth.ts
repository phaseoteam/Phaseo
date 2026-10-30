import "server-only";

import { createClient } from "@/utils/supabase/server";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function requireAuthenticatedUser(): Promise<{
	supabase: SupabaseServerClient;
	user: { id: string; email?: string | null };
}> {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user?.id) {
		throw new Error("Unauthorized");
	}

	return {
		supabase,
		user: { id: user.id, email: (user as any).email ?? null },
	};
}

export async function requireWorkspaceMembership(
	supabase: SupabaseServerClient,
	userId: string,
	workspaceId: string,
	roles?: Array<"owner" | "admin" | "member">,
): Promise<void> {
	if (!userId || !workspaceId) throw new Error("Unauthorized");

	void supabase;
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const query = new URLSearchParams({ workspaceId });
	if (roles?.length) query.set("roles", roles.join(","));
	const access = await fetchAccountWebApi<{ allowed: boolean; userId: string | null }>(`/api/account/auth/workspace-access?${query.toString()}`, accessToken).catch(() => null);
	if (!access?.allowed || access.userId !== userId) throw new Error("Unauthorized");

	await evaluateTeamSsoEnforcementNoop({
		workspaceId,
		userId,
		authMethod: "unknown",
		source: "server_action",
	});
}

export function requireActingUser(
	expectedUserId: string,
	actualUserId: string,
) {
	if (!expectedUserId || expectedUserId !== actualUserId) {
		throw new Error("Unauthorized");
	}
}

