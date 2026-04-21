import "server-only";

import { createClient } from "@/utils/supabase/server";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";

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

	let q = supabase
		.from("workspace_members")
		.select("role")
		.eq("user_id", userId)
		.eq("workspace_id", workspaceId)
		.limit(1)
		.maybeSingle();

	if (roles?.length) {
		q = (q as any).in("role", roles);
	}

	const { data, error } = await q;
	if (error || !data) throw new Error("Unauthorized");

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

