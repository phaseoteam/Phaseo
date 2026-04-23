import "server-only";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { evaluateTeamSsoEnforcementNoop } from "@/lib/auth/ssoEnforcement";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function hasWorkspaceAccessViaRpc(
	supabase: SupabaseServerClient,
	workspaceId: string,
	roles?: Array<"owner" | "admin" | "member">,
): Promise<boolean> {
	const requiresAdmin =
		Array.isArray(roles) &&
		roles.length > 0 &&
		roles.every((role) => role !== "member");
	const allowsMember = !roles?.length || roles.includes("member");

	try {
		if (!requiresAdmin) {
			const { data: adminAccess, error: adminError } = await (supabase as any).rpc(
				"is_workspace_admin",
				{ p_workspace_id: workspaceId },
			);
			if (!adminError && Boolean(adminAccess)) {
				return true;
			}
		} else {
			const { data: adminAccess, error: adminError } = await (supabase as any).rpc(
				"is_workspace_admin",
				{ p_workspace_id: workspaceId },
			);
			if (!adminError && Boolean(adminAccess)) {
				return true;
			}
			return false;
		}

		if (allowsMember) {
			const { data: memberAccess, error: memberError } = await (supabase as any).rpc(
				"is_workspace_member",
				{ p_workspace_id: workspaceId },
			);
			if (!memberError && Boolean(memberAccess)) {
				return true;
			}
		}
	} catch {
		// fall through to existing DB checks
	}

	return false;
}

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

	const rpcAccessible = await hasWorkspaceAccessViaRpc(
		supabase,
		workspaceId,
		roles,
	);
	if (rpcAccessible) {
		await evaluateTeamSsoEnforcementNoop({
			workspaceId,
			userId,
			authMethod: "unknown",
			source: "server_action",
		});
		return;
	}

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
	if (error || !data) {
		let admin: ReturnType<typeof createAdminClient> | null = null;
		try {
			admin = createAdminClient();
		} catch {
			admin = null;
		}

		if (admin) {
			let adminQuery = admin
				.from("workspace_members")
				.select("role")
				.eq("user_id", userId)
				.eq("workspace_id", workspaceId)
				.limit(1)
				.maybeSingle();

			if (roles?.length) {
				adminQuery = (adminQuery as any).in("role", roles);
			}

			const { data: adminMembership } = await adminQuery;
			if (!adminMembership) {
				const { data: ownedWorkspace } = await admin
					.from("workspaces")
					.select("id")
					.eq("id", workspaceId)
					.eq("owner_user_id", userId)
					.limit(1)
					.maybeSingle();
				if (!ownedWorkspace?.id) {
					throw new Error("Unauthorized");
				}
			}
		} else {
			const { data: ownedWorkspace, error: ownerError } = await supabase
				.from("workspaces")
				.select("id")
				.eq("id", workspaceId)
				.eq("owner_user_id", userId)
				.limit(1)
				.maybeSingle();

			if (ownerError || !ownedWorkspace?.id) {
				throw new Error("Unauthorized");
			}
		}
	}

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

