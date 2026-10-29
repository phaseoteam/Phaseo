import { getSupabaseActor } from "@/lib/oauth/service";
import type { AuthSuccess } from "@/pipeline/before/auth";
import { getSupabaseAdmin } from "@/runtime/env";
import { json } from "@/routes/utils";

// The dashboard calls a few control routes through web-api with the signed-in
// user's Supabase session and an x-phaseo-workspace-id header, instead of a
// management key. Routes check the returned role themselves.

export type DashboardSession = { auth: AuthSuccess; role: string };

const NO_STORE = { "Cache-Control": "no-store" };

function bearerToken(req: Request): string | null {
	const authorization = req.headers.get("authorization")?.trim() ?? "";
	if (!authorization.toLowerCase().startsWith("bearer ")) return null;
	return authorization.slice(7).trim() || null;
}

/** Supabase access tokens are JWTs; management keys and OAuth tokens are not checked against Supabase. */
function looksLikeJwt(token: string): boolean {
	return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(token);
}

/**
 * Returns null when the request is not a dashboard call, so the route falls
 * back to management authentication: SDK callers may send the workspace header
 * with a management key, so only a workspace header plus a token Supabase
 * accepts counts as a dashboard session. Returns 403 when the workspace cannot
 * be read, and otherwise the caller's auth with the given scopes and their
 * workspace role ("owner" for the workspace owner, else the membership role,
 * or "" for non-members).
 */
export async function authenticateDashboardSession(req: Request, scopes: string[]): Promise<DashboardSession | Response | null> {
	const workspaceId = req.headers.get("x-phaseo-workspace-id")?.trim();
	if (!workspaceId) return null;
	const token = bearerToken(req);
	if (!token || !looksLikeJwt(token)) return null;
	const actor = await getSupabaseActor(token);
	if (!actor) return null;
	const role = await workspaceRole(workspaceId, actor.userId);
	if (role === null) return json({ error: "forbidden" }, 403, NO_STORE);
	return {
		role,
		auth: {
			ok: true,
			workspaceId,
			apiKeyId: `dashboard:${actor.userId}`,
			apiKeyRef: "dashboard",
			apiKeyKid: "dashboard",
			userId: actor.userId,
			internal: false,
			authMethod: "oauth",
			oauthScopes: scopes,
			scopes,
		},
	};
}

/**
 * The user's role in the workspace as the dashboard sees it: "owner" for the
 * workspace owner, else the membership role, or "" for non-members. Null when
 * the workspace cannot be read.
 */
export async function workspaceRole(workspaceId: string, userId: string): Promise<string | null> {
	const client = getSupabaseAdmin();
	const [membership, workspace] = await Promise.all([
		client.from("workspace_members").select("role")
			.eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	if (membership.error || workspace.error || !workspace.data) return null;
	return workspace.data.owner_user_id === userId
		? "owner"
		: String(membership.data?.role ?? "").toLowerCase();
}
