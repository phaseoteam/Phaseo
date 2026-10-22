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

/**
 * Returns null when the request is not a dashboard call (no workspace header),
 * a 401/403 response when the session or workspace is invalid, and otherwise
 * the caller's auth with the given scopes and their workspace role ("owner"
 * for the workspace owner, else the membership role, or "" for non-members).
 */
export async function authenticateDashboardSession(req: Request, scopes: string[]): Promise<DashboardSession | Response | null> {
	const workspaceId = req.headers.get("x-phaseo-workspace-id")?.trim();
	if (!workspaceId) return null;
	const token = bearerToken(req);
	const actor = token ? await getSupabaseActor(token) : null;
	if (!actor) return json({ error: "unauthorized" }, 401, NO_STORE);
	const client = getSupabaseAdmin();
	const [membership, workspace] = await Promise.all([
		client.from("workspace_members").select("role")
			.eq("workspace_id", workspaceId).eq("user_id", actor.userId).maybeSingle(),
		client.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle(),
	]);
	if (membership.error || workspace.error || !workspace.data) {
		return json({ error: "forbidden" }, 403, NO_STORE);
	}
	const role = workspace.data.owner_user_id === actor.userId
		? "owner"
		: String(membership.data?.role ?? "").toLowerCase();
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
