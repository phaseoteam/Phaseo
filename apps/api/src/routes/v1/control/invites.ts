// Joining a workspace with an invite code, as the signed-in person: the API
// side of the dashboard's "Join a workspace". Accepting an invite asks to join;
// a workspace owner or admin approves the request
// (/v1/workspaces/:id/join-requests), exactly as in the dashboard.
// Only OAuth tokens can use these routes: a management key belongs to a
// workspace, not a person, so it has no one to add.
// Invites are accepted by code only. An invite id is visible to every admin of
// the inviting workspace, so accepting by id would let anyone holding one join.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { json, withRuntime } from "@/routes/utils";
import { internalServerError, isResponse, requireCapability, requireJsonBody } from "./route-helpers";
import { inviteFingerprint } from "./workspace-membership";

const NO_STORE = { "Cache-Control": "no-store" };
const JOIN_REQUEST_STATUSES = new Set(["pending", "approved", "rejected"]);

async function oauthUser(req: Request, scope: string): Promise<{ userId: string; requestId: string } | { response: Response }> {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { response: (auth as GuardErr).response };
	const userId = auth.value.userId?.trim();
	if (auth.value.authMethod !== "oauth" || !userId) {
		return { response: json({ error: "oauth_user_required", message: "Sign in with OAuth to join a workspace; management keys cannot" }, 403, NO_STORE) };
	}
	const scopeError = requireCapability(auth.value, scope);
	if (scopeError) return { response: scopeError };
	return { userId, requestId: auth.value.requestId };
}

async function handleAcceptInvite(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.WORKSPACES_WRITE);
	if ("response" in access) return access.response;
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const token = typeof body.token === "string" ? body.token.trim() : "";
	if (token.length < 6 || token.length > 256) return json({ error: "bad_request", message: "token must be the invite code" }, 400, NO_STORE);
	try {
		const client = getSupabaseAdmin();
		const now = new Date().toISOString();
		const invite = await client.from("workspace_invites").select("id,workspace_id,expires_at,max_uses,uses_count")
			.eq("token_fingerprint", await inviteFingerprint(token))
			.or(`expires_at.is.null,expires_at.gt.${now}`)
			.maybeSingle();
		if (invite.error) throw new Error(invite.error.message || "Failed to read invite");
		if (!invite.data || (invite.data.max_uses != null && (invite.data.uses_count ?? 0) >= invite.data.max_uses)) {
			return json({ error: "not_found", message: "Invalid or expired invite" }, 404, NO_STORE);
		}
		const workspaceId = String(invite.data.workspace_id);
		const [membership, pending] = await Promise.all([
			client.from("workspace_members").select("workspace_id").eq("workspace_id", workspaceId).eq("user_id", access.userId).maybeSingle(),
			client.from("workspace_join_requests").select("id").eq("workspace_id", workspaceId).eq("requester_user_id", access.userId).eq("status", "pending").maybeSingle(),
		]);
		if (membership.error || pending.error) throw new Error((membership.error ?? pending.error)?.message || "Failed to read membership");
		if (membership.data) return json({ error: "already_member", message: "You are already a member of this workspace" }, 409, NO_STORE);
		if (pending.data) return json({ error: "request_pending", message: "You already have a pending request to join this workspace", request_id: pending.data.id }, 409, NO_STORE);
		const created = await client.from("workspace_join_requests")
			.insert({ workspace_id: workspaceId, invite_id: invite.data.id, requester_user_id: access.userId, status: "pending" })
			.select("id,workspace_id,status,created_at").maybeSingle();
		if (created.error) {
			// Only one pending request per person and workspace; a concurrent accept got there first.
			if (created.error.code === "23505") return json({ error: "request_pending", message: "You already have a pending request to join this workspace" }, 409, NO_STORE);
			throw new Error(created.error.message || "Failed to create join request");
		}
		if (!created.data) throw new Error("Failed to create join request");
		await recordWorkspaceAuditEvent(client, {
			workspaceId,
			actorUserId: access.userId,
			action: "workspace.join_request.created",
			targetType: "workspace_join_request",
			targetId: String(created.data.id),
			metadata: { invite_id: invite.data.id },
			requestId: access.requestId,
		});
		return json({ data: created.data }, 201, NO_STORE);
	} catch (error) {
		return internalServerError("invites.accept", error);
	}
}

/** The caller's own requests to join workspaces, newest first; pending only unless ?status= says otherwise. */
async function handleListMyJoinRequests(req: Request) {
	const access = await oauthUser(req, CAPABILITIES.WORKSPACES_READ);
	if ("response" in access) return access.response;
	const status = new URL(req.url).searchParams.get("status")?.trim().toLowerCase() || "pending";
	if (status !== "all" && !JOIN_REQUEST_STATUSES.has(status)) {
		return json({ error: "bad_request", message: "status must be pending, approved, rejected, or all" }, 400, NO_STORE);
	}
	try {
		let query = getSupabaseAdmin().from("workspace_join_requests")
			.select("id,workspace_id,status,created_at,decided_at,workspaces:workspaces(name)")
			.eq("requester_user_id", access.userId)
			.order("created_at", { ascending: false })
			.limit(100);
		if (status !== "all") query = query.eq("status", status);
		const { data, error } = await query;
		if (error) throw new Error(error.message || "Failed to list join requests");
		return json({
			data: (data ?? []).map((row: any) => {
				const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
				return {
					id: row.id,
					workspace_id: row.workspace_id,
					workspace_name: workspace?.name ?? null,
					status: row.status,
					created_at: row.created_at,
					decided_at: row.decided_at ?? null,
				};
			}),
		}, 200, NO_STORE);
	} catch (error) {
		return internalServerError("invites.requests.list", error);
	}
}

export const invitesRoutes = new Hono<Env>();

invitesRoutes.post("/accept", withRuntime(handleAcceptInvite));
invitesRoutes.get("/requests", withRuntime(handleListMyJoinRequests));
