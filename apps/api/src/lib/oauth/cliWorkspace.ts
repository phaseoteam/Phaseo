import { getSupabaseAdmin } from "@/runtime/env";
import { ensureGrant, issueTokenPair } from "@/lib/oauth/service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CliWorkspaceSwitchResult =
	| {
			ok: true;
			workspace: { id: string; name: string | null; slug: string | null };
			tokens: Awaited<ReturnType<typeof issueTokenPair>>;
	  }
	| { ok: false; reason: "not_member" | "not_admin" | "revoked" };

/**
 * A new Phaseo CLI session for another workspace of the same person. Every CLI token, refresh token and
 * consent is bound to one workspace, so the CLI moves between workspaces by swapping its session rather
 * than by naming a workspace per request. Only an owner or admin of the target may switch. The CLI's
 * consent there is reused, narrowed to the current session's scopes; one the person revoked stays revoked
 * (they approve it again with `phaseo login`); a workspace with none gets one carrying the session's scopes,
 * which never exceed what the person already approved for the CLI.
 */
export async function issueCliWorkspaceSession(args: {
	userId: string;
	clientId: string;
	scopes: string[];
	workspace: string;
}): Promise<CliWorkspaceSwitchResult> {
	const supabase = getSupabaseAdmin();
	const identifier = args.workspace.trim();
	const { data: workspace, error: workspaceError } = await supabase
		.from("workspaces")
		.select("id, name, slug")
		.eq(UUID_PATTERN.test(identifier) ? "id" : "slug", identifier)
		.maybeSingle();
	if (workspaceError) throw new Error(workspaceError.message || "Failed to load workspace");
	// A workspace the person can't see answers the same as one that doesn't exist.
	if (!workspace) return { ok: false, reason: "not_member" };
	const workspaceId = String(workspace.id);

	const { data: membership, error: membershipError } = await supabase
		.from("workspace_members")
		.select("role")
		.eq("workspace_id", workspaceId)
		.eq("user_id", args.userId)
		.maybeSingle();
	if (membershipError) throw new Error(membershipError.message || "Failed to load workspace membership");
	if (!membership) return { ok: false, reason: "not_member" };
	const role = String(membership.role ?? "").toLowerCase();
	if (role !== "owner" && role !== "admin") return { ok: false, reason: "not_admin" };

	const { data: authorization, error: authorizationError } = await supabase
		.from("oauth_authorizations")
		.select("scopes, revoked_at")
		.eq("user_id", args.userId)
		.eq("client_id", args.clientId)
		.eq("workspace_id", workspaceId)
		.maybeSingle();
	if (authorizationError) throw new Error(authorizationError.message || "Failed to load OAuth authorization");
	if (authorization && authorization.revoked_at !== null) return { ok: false, reason: "revoked" };

	let scopes = [...new Set(args.scopes)];
	if (authorization) {
		const granted = new Set(Array.isArray(authorization.scopes) ? authorization.scopes.map(String) : []);
		scopes = scopes.filter((scope) => granted.has(scope));
	} else {
		await ensureGrant({ userId: args.userId, workspaceId, clientId: args.clientId, scopes });
	}

	const tokens = await issueTokenPair({ userId: args.userId, workspaceId, clientId: args.clientId, scopes });
	return {
		ok: true,
		workspace: { id: workspaceId, name: (workspace.name as string | null) ?? null, slug: (workspace.slug as string | null) ?? null },
		tokens,
	};
}
